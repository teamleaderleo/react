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

const {
  patchMessageChannel,
} = require('../../../../scripts/jest/patchMessageChannel');

let ReactServerDOMServer;
let ReactServerScheduler;
let serverAct;
let webpackMap;

function trackAbortListeners(signal) {
  const active = new Set();
  const addEventListener = signal.addEventListener.bind(signal);
  const removeEventListener = signal.removeEventListener.bind(signal);

  jest
    .spyOn(signal, 'addEventListener')
    .mockImplementation((type, listener, options) => {
      if (type === 'abort') {
        active.add(listener);
      }
      return addEventListener(type, listener, options);
    });
  jest
    .spyOn(signal, 'removeEventListener')
    .mockImplementation((type, listener, options) => {
      if (type === 'abort') {
        active.delete(listener);
      }
      return removeEventListener(type, listener, options);
    });

  return active;
}

async function consume(stream) {
  const reader = stream.getReader();
  while (true) {
    const {done} = await reader.read();
    if (done) {
      return;
    }
  }
}

describe('ReactFlightDOMServer AbortSignal cleanup', () => {
  beforeEach(() => {
    jest.resetModules();

    ReactServerScheduler = require('scheduler');
    patchMessageChannel(ReactServerScheduler);
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.edge'),
    );

    const WebpackMock = require('./utils/WebpackMock');
    webpackMap = WebpackMock.webpackMap;
    ReactServerDOMServer = require('react-server-dom-webpack/server');
  });

  it('releases the signal listener after an ordinary completed stream is consumed', async () => {
    const controller = new AbortController();
    const active = trackAbortListeners(controller.signal);

    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        {value: 'done'},
        webpackMap,
        {signal: controller.signal},
      ),
    );
    expect(active.size).toBe(1);

    await consume(stream);
    await serverAct(async () => {});

    expect(active.size).toBe(0);
  });

  it('installs no listener for an already-aborted signal', async () => {
    const controller = new AbortController();
    const reason = new Error('already stopped');
    controller.abort(reason);
    const active = trackAbortListeners(controller.signal);

    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        {value: 'unused'},
        webpackMap,
        {signal: controller.signal},
      ),
    );

    expect(active.size).toBe(0);
    await consume(stream);
  });

  it('releases the listener when the external signal aborts', async () => {
    let resolvePending;
    const pending = new Promise(resolve => {
      resolvePending = resolve;
    });
    const controller = new AbortController();
    const active = trackAbortListeners(controller.signal);
    const reason = new Error('stop render');

    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        {pending},
        webpackMap,
        {signal: controller.signal},
      ),
    );
    expect(active.size).toBe(1);

    controller.abort(reason);
    expect(active.size).toBe(0);

    resolvePending('late');
    await consume(stream);
  });

  it('releases the external signal listener when the returned stream is cancelled', async () => {
    let resolvePending;
    const pending = new Promise(resolve => {
      resolvePending = resolve;
    });
    const controller = new AbortController();
    const active = trackAbortListeners(controller.signal);

    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        {pending},
        webpackMap,
        {signal: controller.signal},
      ),
    );
    expect(active.size).toBe(1);

    await stream.cancel(new Error('consumer stopped'));
    await serverAct(async () => {});

    expect(active.size).toBe(0);
    resolvePending('late');
  });
});
