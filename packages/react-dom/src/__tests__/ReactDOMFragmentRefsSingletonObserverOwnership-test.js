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
let Activity;

describe('FragmentRefs HostSingleton observer ownership', () => {
  beforeEach(() => {
    jest.resetModules();
    JSDOM = require('jsdom');
    React = require('react');
    Fragment = React.Fragment;
    Activity = React.Activity;
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
  it('does not unobserve a singleton still owned by another Fragment', async () => {
    const hiddenFragmentRef = React.createRef();
    const visibleFragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(document);
    const activeTargets = new Set();
    const observer = {
      observe: jest.fn(target => activeTargets.add(target)),
      unobserve: jest.fn(target => activeTargets.delete(target)),
    };

    await act(() => {
      root.render(
        <Activity mode="visible">
          <Fragment ref={hiddenFragmentRef}>
            <html>
              <head />
              <body />
            </html>
          </Fragment>
        </Activity>,
      );
    });
    hiddenFragmentRef.current.observeUsing(observer);
    expect(activeTargets.has(document.documentElement)).toBe(true);

    await act(() => {
      root.render(
        <>
          <Activity mode="hidden">
            <Fragment ref={hiddenFragmentRef}>
              <html>
                <head />
                <body />
              </html>
            </Fragment>
          </Activity>
          <Fragment ref={visibleFragmentRef}>
            <html>
              <head />
              <body />
            </html>
          </Fragment>
        </>,
      );
    });
    visibleFragmentRef.current.observeUsing(observer);
    expect(activeTargets.has(document.documentElement)).toBe(true);

    await act(() => {
      root.render(
        <Fragment ref={visibleFragmentRef}>
          <html>
            <head />
            <body />
          </html>
        </Fragment>,
      );
    });

    // The hidden Fragment's ownership ended, but the visible Fragment still
    // uses the same cached platform observer for the persistent singleton.
    expect(visibleFragmentRef.current).not.toBe(null);
    expect(activeTargets.has(document.documentElement)).toBe(true);
  });
});
