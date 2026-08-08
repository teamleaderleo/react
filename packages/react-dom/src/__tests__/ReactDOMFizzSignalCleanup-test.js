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

let React;
let ReactDOMServer;
let ReactDOMStatic;
let serverAct;

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

describe('Fizz AbortSignal cleanup', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMServer = require('react-dom/server.edge');
    ReactDOMStatic = require('react-dom/static.edge');
    serverAct = require('internal-test-utils').serverAct;
  });

  it('releases the signal listener after an ordinary readable stream fully closes', async () => {
    const controller = new AbortController();
    const active = trackAbortListeners(controller.signal);

    const stream = await ReactDOMServer.renderToReadableStream(
      <div>complete</div>,
      {signal: controller.signal},
    );

    // Shell resolution is not the request-lifetime boundary. The stream still
    // owns the request until its bytes have actually flowed and the destination
    // closes.
    expect(active.size).toBe(1);

    await consume(stream);
    await serverAct(async () => {});

    expect(active.size).toBe(0);
  });

  it('installs no listener for an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already stopped'));
    const active = trackAbortListeners(controller.signal);

    const stream = await ReactDOMServer.renderToReadableStream(
      <div>aborted</div>,
      {signal: controller.signal},
    );

    expect(active.size).toBe(0);
    await consume(stream);
  });

  it('releases the listener when the returned readable stream is cancelled', async () => {
    const controller = new AbortController();
    const active = trackAbortListeners(controller.signal);

    const stream = await ReactDOMServer.renderToReadableStream(
      <div>cancel me</div>,
      {signal: controller.signal},
    );
    expect(active.size).toBe(1);

    await stream.cancel(new Error('consumer stopped'));
    await serverAct(async () => {});

    expect(active.size).toBe(0);
  });

  it('keeps prerender cancellation authority until the prelude request actually closes', async () => {
    const controller = new AbortController();
    const active = trackAbortListeners(controller.signal);

    const result = await ReactDOMStatic.prerender(<div>prelude</div>, {
      signal: controller.signal,
    });

    // prerender() resolving its result is deliberately not terminal. The
    // returned prelude has not flowed yet and still owns the underlying request.
    expect(active.size).toBe(1);

    await consume(result.prelude);
    await serverAct(async () => {});

    expect(active.size).toBe(0);
  });
});
