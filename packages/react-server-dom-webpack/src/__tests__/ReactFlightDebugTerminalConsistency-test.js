/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

let ReactServerDOMClient;

function createControlledResponse() {
  let controller;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });
  const response = ReactServerDOMClient.createFromReadableStream(stream, {
    replayConsoleLogs: false,
  });
  return {controller, response};
}

function observeOutcome(thenable) {
  return new Promise(resolve => {
    thenable.then(
      value => resolve({status: 'fulfilled', value}),
      error => resolve({status: 'rejected', error}),
    );
  });
}

describe('ReactFlight debug terminal consistency', () => {
  beforeEach(() => {
    jest.resetModules();
    ReactServerDOMClient = require('react-server-dom-webpack/client');
  });

  it('does not let debug initialization reject an early observer and later fulfill the same chunk', async () => {
    const {controller, response} = createControlledResponse();
    const earlyOutcome = observeOutcome(response);

    // Root debug info first blocks on chunk 1. Chunk 1 then fails to parse,
    // which leaves the root's debug chunk errored. The root model itself is
    // valid and arrives last.
    controller.enqueue(
      new TextEncoder().encode('0:D"$1"\n1:not-json\n0:"value"\n'),
    );
    controller.close();

    const early = await earlyOutcome;
    expect(early.status).toBe('rejected');
    expect(early.error).toBeInstanceOf(SyntaxError);

    // One chunk must have one terminal outcome. Current source is expected to
    // fail here if initializeModelChunk overwrites the debug-derived rejection
    // with the successfully parsed model value.
    await expect(Promise.resolve(response)).rejects.toBe(early.error);
  });

  it('keeps a genuine model parse error terminal for early and late observers', async () => {
    const {controller, response} = createControlledResponse();
    const earlyOutcome = observeOutcome(response);

    controller.enqueue(new TextEncoder().encode('0:not-json\n'));
    controller.close();

    const early = await earlyOutcome;
    expect(early.status).toBe('rejected');
    expect(early.error).toBeInstanceOf(SyntaxError);

    await expect(Promise.resolve(response)).rejects.toBe(early.error);
  });
});
