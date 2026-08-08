/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

describe('DevTools backend manager welcome boundary', () => {
  it('ignores invalid messages and still accepts the real welcome', () => {
    const errors = [];
    const onError = event => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);

    const unsubscribe = jest.fn();
    const hook = {
      renderers: new Map(),
      backends: new Map(),
      sub: jest.fn(() => unsubscribe),
    };

    try {
      jest.resetModules();
      delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
      require('../backendManager');

      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: null,
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: 'unrelated',
        }),
      );

      expect(errors).toEqual([]);
      expect(hook.sub).not.toHaveBeenCalled();

      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: {
            source: 'react-devtools-content-script',
            hello: true,
          },
        }),
      );

      expect(hook.sub).toHaveBeenCalledTimes(3);

      // The welcome listener removes itself after the first valid handshake.
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: {
            source: 'react-devtools-content-script',
            hello: true,
          },
        }),
      );
      expect(hook.sub).toHaveBeenCalledTimes(3);
    } finally {
      window.dispatchEvent(new Event('pagehide'));
      window.removeEventListener('error', onError);
      delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;
    }
  });
});
