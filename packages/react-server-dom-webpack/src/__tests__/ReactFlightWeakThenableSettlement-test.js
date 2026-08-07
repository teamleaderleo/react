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

let ReactServer;
let ReactServerDOMServer;
let ReactServerDOMClient;
let serverAct;

describe('ReactFlight weak thenable settlement row types', () => {
  beforeEach(() => {
    jest.resetModules();
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.edge'),
    );
    ReactServer = require('react');
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

  // @gate enableFlightWeakThenables
  it('fulfills a weak thenable that settles to a large string', async () => {
    const {thenable, settle} = createWeakThenable();
    const expected = 'x'.repeat(5000);

    function Page() {
      settle(expected);
      return 'done';
    }

    let response;
    await serverAct(() => {
      const stream = ReactServerDOMServer.renderToReadableStream({
        weak: thenable,
        root: <Page />,
      });
      response = ReactServerDOMClient.createFromReadableStream(stream, {
        serverConsumerManifest: {
          moduleMap: null,
          moduleLoading: null,
        },
      });
    });

    const result = await response;
    expect(result.root).toBe('done');
    expect(await result.weak).toBe(expected);
  });
});
