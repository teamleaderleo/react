/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

global.TextDecoder = require('util').TextDecoder;
global.TextEncoder = require('util').TextEncoder;

let React;
let ReactMarkup;

function createTrackedSignal() {
  const listeners = new Set();
  return {
    signal: {
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
    },
    listeners,
  };
}

if (!__EXPERIMENTAL__) {
  it('should not be built in stable', () => {});
} else {
  describe('ReactMarkup server AbortSignal listener lifetime', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.mock('react', () => require('react/react.react-server'));
      jest.mock('react-markup', () =>
        require('react-markup/react-markup.react-server'),
      );
      React = require('react');
      ReactMarkup = require('react-markup');
    });

    it('releases the abort listener after a successful render', async () => {
      const {signal, listeners} = createTrackedSignal();

      const html = await ReactMarkup.experimental_renderToHTML(
        React.createElement('div', null, 'hello'),
        {signal},
      );

      expect(html).toBe('<div>hello</div>');
      expect(listeners.size).toBe(0);
    });

    it('releases the abort listener after a failed render', async () => {
      const {signal, listeners} = createTrackedSignal();
      const expectedError = new Error('server render failed');

      function Component() {
        throw expectedError;
      }

      await expect(
        ReactMarkup.experimental_renderToHTML(
          React.createElement(Component),
          {signal},
        ),
      ).rejects.toBe(expectedError);

      expect(listeners.size).toBe(0);
    });
  });
}
