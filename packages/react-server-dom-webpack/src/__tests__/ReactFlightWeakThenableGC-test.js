/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

let ReactServerDOMServer;
let serverAct;

function exposeGC() {
  const v8 = require('v8');
  const vm = require('vm');
  v8.setFlagsFromString('--expose_gc');
  return vm.runInNewContext('gc');
}

function createNeverSettlingWeakThenable() {
  const listeners = [];
  const thenable = {
    status: 'pending_weak',
    value: undefined,
    then(onFulfill, onReject) {
      listeners.push(onFulfill, onReject);
    },
  };
  return {thenable, listeners};
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

async function collectUntil(gc, ref, shouldCollect) {
  for (let i = 0; i < 40; i++) {
    // Give objects dereferenced during the previous check a full turn to lose
    // their temporary WeakRef keep-alive guarantee before the next collection.
    await new Promise(resolve => setImmediate(resolve));
    gc();
    await new Promise(resolve => setImmediate(resolve));
    const value = ref.deref();
    if (shouldCollect ? value === undefined : value !== undefined) {
      return true;
    }
  }
  return false;
}

async function createCompletedWeakRequest(thenable) {
  // The manifest is intentionally unique and otherwise unreachable after this
  // function returns. A live reference to it therefore demonstrates that some
  // part of the completed Flight request remains reachable.
  let manifest = {};
  const manifestRef = new WeakRef(manifest);
  let stream;
  await serverAct(() => {
    stream = ReactServerDOMServer.renderToReadableStream({weak: thenable}, manifest);
  });
  await consume(stream);
  stream = null;
  manifest = null;
  return manifestRef;
}

describe('ReactFlight pending_weak request retention', () => {
  beforeEach(() => {
    jest.resetModules();
    serverAct = require('internal-test-utils').serverAct;
    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.edge'),
    );
    ReactServerDOMServer = require('react-server-dom-webpack/server');
  });

  // @gate enableFlightWeakThenables
  it('releases a completed request once externally retained weak callbacks are cleared', async () => {
    const gc = exposeGC();
    const {thenable, listeners} = createNeverSettlingWeakThenable();
    const manifestRef = await createCompletedWeakRequest(thenable);

    // Current source leaves fulfillment/rejection callbacks registered on the
    // externally retained tracker. Those callbacks close over the completed
    // Request, which in turn owns the unique manifest.
    expect(await collectUntil(gc, manifestRef, false)).toBe(true);
    expect(listeners.length).toBeGreaterThan(0);

    // Clearing only the tracker callbacks removes the suspected retaining edge.
    // This is the positive control for the proposed request-lifetime cleanup.
    listeners.length = 0;
    expect(await collectUntil(gc, manifestRef, true)).toBe(true);
  });
});
