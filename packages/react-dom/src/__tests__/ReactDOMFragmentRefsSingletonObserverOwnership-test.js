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
  it('does not unobserve a singleton retained by another hidden Fragment', async () => {
    const fragmentARef = React.createRef();
    const fragmentBRef = React.createRef();
    const root = ReactDOMClient.createRoot(document);
    const activeTargets = new Set();
    const observer = {
      observe: jest.fn(target => activeTargets.add(target)),
      unobserve: jest.fn(target => activeTargets.delete(target)),
    };

    await act(() => {
      root.render(
        <Activity mode="visible">
          <Fragment ref={fragmentARef}>
            <html>
              <head />
              <body />
            </html>
          </Fragment>
        </Activity>,
      );
    });
    fragmentARef.current.observeUsing(observer);
    expect(activeTargets.has(document.documentElement)).toBe(true);

    await act(() => {
      root.render(
        <>
          <Activity mode="hidden">
            <Fragment ref={fragmentARef}>
              <html>
                <head />
                <body />
              </html>
            </Fragment>
          </Activity>
          <Activity mode="visible">
            <Fragment ref={fragmentBRef}>
              <html>
                <head />
                <body />
              </html>
            </Fragment>
          </Activity>
        </>,
      );
    });
    fragmentBRef.current.observeUsing(observer);
    expect(activeTargets.has(document.documentElement)).toBe(true);

    // Disappearing an Activity deliberately keeps its Fragment observers
    // attached even though its DOM Fragment handles are temporarily removed.
    await act(() => {
      root.render(
        <>
          <Activity mode="hidden">
            <Fragment ref={fragmentARef}>
              <html>
                <head />
                <body />
              </html>
            </Fragment>
          </Activity>
          <Activity mode="hidden">
            <Fragment ref={fragmentBRef}>
              <html>
                <head />
                <body />
              </html>
            </Fragment>
          </Activity>
        </>,
      );
    });
    expect(activeTargets.has(document.documentElement)).toBe(true);

    // Permanently delete A while B remains hidden. B still retains the same
    // cached observer relationship, so A must not cancel the platform target.
    await act(() => {
      root.render(
        <Activity mode="hidden">
          <Fragment ref={fragmentBRef}>
            <html>
              <head />
              <body />
            </html>
          </Fragment>
        </Activity>,
      );
    });

    expect(activeTargets.has(document.documentElement)).toBe(true);
  });
});
