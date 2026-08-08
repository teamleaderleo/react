/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails reactcore
 * @jest-environment node
 */

'use strict';

let JSDOM;
let React;
let ReactDOMClient;
let act;
let document;
let Fragment;

describe('FragmentRefs document dispatch', () => {
  beforeEach(() => {
    jest.resetModules();
    JSDOM = require('jsdom');
    React = require('react');
    Fragment = React.Fragment;
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;

    const jsdom = new JSDOM.JSDOM('');
    document = jsdom.window.document;
    global.window = jsdom.window;
    global.document = global.window.document;
    global.navigator = global.window.navigator;
    global.Event = global.window.Event;
  });

  // @gate enableFragmentRefs
  it('dispatches from a top-level Fragment to its Document parent', async () => {
    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(document);

    await act(() => {
      root.render(
        <Fragment ref={fragmentRef}>
          <html>
            <body />
          </html>
        </Fragment>,
      );
    });

    const fragmentListener = jest.fn();
    const documentListener = jest.fn();
    fragmentRef.current.addEventListener('custom', fragmentListener);
    document.addEventListener('custom', documentListener);

    const result = fragmentRef.current.dispatchEvent(
      new Event('custom', {bubbles: true, cancelable: true}),
    );

    expect(result).toBe(true);
    expect(fragmentListener).toHaveBeenCalledTimes(1);
    expect(documentListener).toHaveBeenCalledTimes(1);
  });
});
