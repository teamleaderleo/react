/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment ./scripts/jest/ReactDOMServerIntegrationEnvironment
 */

'use strict';

// Patch for Edge environments for global scope.
global.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;

let ReactServerDOMServer;
let webpackServerMap;

function createMicrotaskIterable(entries) {
  let index = 0;
  let nextCalls = 0;
  const escapedErrors = [];
  const throwReasons = [];

  const iterator = {
    next() {
      nextCalls++;
      const entry =
        index < entries.length
          ? entries[index++]
          : {done: true, value: undefined};
      return {
        then(resolve) {
          queueMicrotask(() => {
            try {
              resolve(entry);
            } catch (error) {
              // Native Promises would turn this into a rejected child Promise.
              // Capture it explicitly so the test can prove whether the wrapper
              // lets a field-processing exception escape progress().
              escapedErrors.push(error);
            }
          });
        },
      };
    },
    throw(reason) {
      throwReasons.push(reason);
      return Promise.resolve({done: true, value: undefined});
    },
  };

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return iterator;
      },
    },
    escapedErrors,
    getNextCalls() {
      return nextCalls;
    },
    throwReasons,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('decodeReplyFromAsyncIterable field-processing errors', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.edge'),
    );

    const WebpackMock = require('./utils/WebpackMock');
    webpackServerMap = WebpackMock.webpackServerMap;
    ReactServerDOMServer = require('react-server-dom-webpack/server');
  });

  it('turns a delivered-field processing failure into the terminal decode error', async () => {
    const {
      iterable,
      escapedErrors,
      getNextCalls,
      throwReasons,
    } = createMicrotaskIterable([
      {
        done: false,
        value: ['0', '{"stable":"yes","pending":"$@1"}'],
      },
      {
        done: false,
        // Repeating an ordinary model row after chunk 0 is no longer pending
        // enters the repeated-row stream path. Because chunk 0 is not a stream,
        // processing this field throws synchronously.
        value: ['0', '{"duplicate":true}'],
      },
    ]);

    const root = ReactServerDOMServer.decodeReplyFromAsyncIterable(
      iterable,
      webpackServerMap,
    );

    await flushMicrotasks();
    const decoded = await root;
    expect(decoded.stable).toBe('yes');

    // The wrapper should catch the processing error and route it through its
    // existing error() path rather than allowing it to escape the fulfillment
    // callback of iterator.next().then(...).
    expect(escapedErrors).toEqual([]);
    expect(throwReasons).toHaveLength(1);
    expect(getNextCalls()).toBe(2);

    const pendingSettlement = new Promise(resolve => {
      decoded.pending.then(
        value => resolve({status: 'fulfilled', value}),
        reason => resolve({status: 'rejected', reason}),
      );
    });
    const outcome = await Promise.race([
      pendingSettlement,
      Promise.resolve({status: 'still-pending'}),
    ]);

    expect(outcome.status).toBe('rejected');
    expect(outcome.reason).toBe(throwReasons[0]);
  });
});
