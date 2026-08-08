/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

import {patchMessageChannel} from '../../../../scripts/jest/patchMessageChannel';

global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;
global.__webpack_require__ = function () {};
global.__webpack_require__.u = id => id;
global.__webpack_chunk_load__ = () => Promise.resolve();
global.__webpack_get_script_filename__ = id => id;

let ReactServerDOMClient;

function snapshotFormData(body) {
  expect(body instanceof FormData).toBe(true);
  return Array.from(body.entries()).map(([key, value]) => [
    key,
    typeof value === 'string'
      ? value
      : {name: value.name, size: value.size, type: value.type},
  ]);
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ReactFlightDOMReply terminal settlement', () => {
  beforeEach(() => {
    jest.resetModules();
    patchMessageChannel(require('scheduler'));
    __unmockReact();
    ReactServerDOMClient = require('react-server-dom-webpack/client');
  });

  it('keeps the partial FormData immutable when a Promise settles after abort', async () => {
    let resolvePending;
    const pending = new Promise(resolve => {
      resolvePending = resolve;
    });
    const controller = new AbortController();

    const bodyPromise = ReactServerDOMClient.encodeReply(
      {stable: 'yes', pending},
      {signal: controller.signal},
    );
    controller.abort(new Error('stop reply'));

    const body = await bodyPromise;
    const before = snapshotFormData(body);

    resolvePending('late value');
    await flushMicrotasks();

    expect(snapshotFormData(body)).toEqual(before);
  });

  it('cancels an acquired ReadableStream and keeps the abort snapshot terminal', async () => {
    let sourceController;
    const cancelReasons = [];
    const stream = new ReadableStream({
      start(controller) {
        sourceController = controller;
      },
      cancel(reason) {
        cancelReasons.push(reason);
      },
    });
    const controller = new AbortController();
    const reason = new Error('stop stream reply');

    const bodyPromise = ReactServerDOMClient.encodeReply(
      {stable: 'yes', stream},
      {signal: controller.signal},
    );
    controller.abort(reason);

    const body = await bodyPromise;
    const before = snapshotFormData(body);

    expect(cancelReasons).toEqual([reason]);

    // A producer can race with cancellation. Whether the controller is already
    // closed or the queued read still resolves, that race must not change the
    // body that encodeReply already published.
    try {
      sourceController.enqueue('late chunk');
      sourceController.close();
    } catch (error) {}
    await flushMicrotasks();

    expect(snapshotFormData(body)).toEqual(before);
  });

  it('returns an acquired async iterator and ignores a late pending next result', async () => {
    const pendingNextResolvers = [];
    let returnCount = 0;
    const iterator = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next() {
        return new Promise(resolve => {
          pendingNextResolvers.push(resolve);
        });
      },
      return() {
        returnCount++;
        return Promise.resolve({done: true, value: undefined});
      },
    };
    const controller = new AbortController();

    const bodyPromise = ReactServerDOMClient.encodeReply(
      {stable: 'yes', iterator},
      {signal: controller.signal},
    );
    expect(pendingNextResolvers).toHaveLength(1);

    controller.abort(new Error('stop iterator reply'));
    const body = await bodyPromise;
    const before = snapshotFormData(body);

    expect(returnCount).toBe(1);

    // Resolve the next() that was already in flight at the abort boundary. A
    // terminal reply must ignore it and must not request another item.
    pendingNextResolvers[0]({done: false, value: 'late item'});
    await flushMicrotasks();

    expect(pendingNextResolvers).toHaveLength(1);
    expect(snapshotFormData(body)).toEqual(before);
  });

  it('stops sibling stream work when another async reply part rejects', async () => {
    const cancelReasons = [];
    const stream = new ReadableStream({
      cancel(reason) {
        cancelReasons.push(reason);
      },
    });
    let rejectPending;
    const failing = new Promise((resolve, reject) => {
      rejectPending = reject;
    });
    const expectedError = new Error('reply part failed');

    const bodyPromise = ReactServerDOMClient.encodeReply({stream, failing});
    rejectPending(expectedError);

    await expect(bodyPromise).rejects.toBe(expectedError);
    expect(cancelReasons).toEqual([expectedError]);
  });
});
