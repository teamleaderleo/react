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
  it('ignores a same-window message with null data', () => {
    const errors = [];
    const onError = event => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);

    try {
      jest.resetModules();
      delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;
      require('../backendManager');

      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: null,
        }),
      );

      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', onError);
      delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;
    }
  });
});
