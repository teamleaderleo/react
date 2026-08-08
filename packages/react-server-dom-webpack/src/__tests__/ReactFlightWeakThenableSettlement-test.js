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

global.AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;

let ReactServerDOMServer;
let ReactServerDOMClient;
let serverAct;

describe('ReactFlight pending thenable specialized-row settlement', () => {
  beforeEach(() => {
    jest.resetModules();
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.edge'),
    );
    ReactServerDOMServer = require('react-server-dom-webpack/server');

    jest.resetModules();
    __unmockReact();
    jest.unmock('react-server-dom-webpack/server');
    jest.mock('react-server-dom-webpack/client', () =>
      require('react-server-dom-webpack/client.edge'),
    );
    ReactServerDOMClient = require('react-server-dom-webpack/client');
  });

  function createWeakThenable() {
    const listeners = [];
    const thenable = {
      status: 'pending_weak',
      value: undefined,
      then(onFulfill) {
        if (thenable.status === 'fulfilled') {
          onFulfill(thenable.value);
        } else {
          listeners.push(onFulfill);
        }
      },
    };
    function settle(value) {
      if (thenable.status !== 'pending_weak') {
        throw new Error('weak thenable already settled');
      }
      thenable.status = 'fulfilled';
      thenable.value = value;
      for (let i = 0; i < listeners.length; i++) {
        listeners[i](value);
      }
      listeners.length = 0;
    }
    return {thenable, settle};
  }

  function createResponse(model) {
    const stream = ReactServerDOMServer.renderToReadableStream(model);
    return ReactServerDOMClient.createFromReadableStream(stream, {
      serverConsumerManifest: {
        moduleMap: null,
        moduleLoading: null,
      },
    });
  }

  it('fulfills an already-referenced Promise with a large string', async () => {
    const expected = 'x'.repeat(5000);
    let resolveValue;
    const value = new Promise(resolve => {
      resolveValue = resolve;
    });
    let resolveHold;
    const hold = new Promise(resolve => {
      resolveHold = resolve;
    });

    let response;
    await serverAct(() => {
      response = createResponse({value, hold});
    });

    const result = await response;
    expect(result.value.status).toBe('pending');

    let receivedValue;
    result.value.then(resolved => {
      receivedValue = resolved;
    });

    await serverAct(() => {
      resolveValue(expected);
    });
    await serverAct(async () => {});

    expect(receivedValue).toBe(expected);
    expect(await result.value).toBe(expected);

    await serverAct(() => {
      resolveHold('done');
    });
    expect(await result.hold).toBe('done');
  });

  // @gate enableFlightWeakThenables
  it('fulfills an already-referenced weak thenable with a large string', async () => {
    const {thenable, settle} = createWeakThenable();
    const expected = 'x'.repeat(5000);
    let resolveHold;
    const hold = new Promise(resolve => {
      resolveHold = resolve;
    });

    let response;
    await serverAct(() => {
      response = createResponse({weak: thenable, hold});
    });

    // The root model has reached the client and created the `$w` weak chunk,
    // while the ordinary promise keeps the server response open.
    const result = await response;
    expect(result.weak.status).toBe('pending_weak');

    let weakValue;
    result.weak.then(value => {
      weakValue = value;
    });

    await serverAct(() => {
      settle(expected);
    });
    await serverAct(async () => {});

    expect(weakValue).toBe(expected);
    expect(await result.weak).toBe(expected);

    await serverAct(() => {
      resolveHold('done');
    });
    expect(await result.hold).toBe('done');
  });
});
