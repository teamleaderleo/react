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

describe('FragmentRefs hidden observer ownership', () => {
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
  it('keeps another hidden Fragment as a logical observer owner', async () => {
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

    // Deleting A releases only A's logical ownership. B remains hidden and
    // still owns the same observer-target pair, so platform observation stays.
    expect(activeTargets.has(document.documentElement)).toBe(true);
    expect(fragmentBRef.current).toBe(null);

    // Reappearing B restores its ref and observer effects without acquiring a
    // second logical ownership count for the same observer-target pair.
    await act(() => {
      root.render(
        <Activity mode="visible">
          <Fragment ref={fragmentBRef}>
            <html>
              <head />
              <body />
            </html>
          </Fragment>
        </Activity>,
      );
    });
    expect(fragmentBRef.current).not.toBe(null);
    expect(activeTargets.has(document.documentElement)).toBe(true);

    fragmentBRef.current.unobserveUsing(observer);
    expect(activeTargets.has(document.documentElement)).toBe(false);
  });
});
