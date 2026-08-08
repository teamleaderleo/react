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

let ReactServerDOMClient;

describe('ReactFlightDOMReply AbortSignal cleanup', () => {
  beforeEach(() => {
    jest.resetModules();
    patchMessageChannel(require('scheduler'));
    __unmockReact();
    ReactServerDOMClient = require('react-server-dom-webpack/client');
  });

  it('removes the AbortSignal listener after an asynchronous reply rejects', async () => {
    const listeners = new Set();
    const signal = {
      aborted: false,
      reason: undefined,
      addEventListener(type, listener) {
        expect(type).toBe('abort');
        listeners.add(listener);
      },
      removeEventListener(type, listener) {
        expect(type).toBe('abort');
        listeners.delete(listener);
      },
    };

    let rejectPending;
    const pending = new Promise((resolve, reject) => {
      rejectPending = reject;
    });
    const expectedError = new Error('async reply failed');

    const bodyPromise = ReactServerDOMClient.encodeReply(
      {pending},
      {signal: (signal: any)},
    );
    expect(listeners.size).toBe(1);

    const rejection = expect(bodyPromise).rejects.toBe(expectedError);
    rejectPending(expectedError);
    await rejection;

    expect(listeners.size).toBe(0);
  });
});
