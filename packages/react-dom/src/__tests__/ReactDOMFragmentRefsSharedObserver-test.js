/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails reactcore
 */

'use strict';

let React;
let ReactDOMClient;
let act;
let container;
let Fragment;

describe('FragmentRefs shared observer ownership', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    Fragment = React.Fragment;
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // @gate enableFragmentRefs
  it('preserves a shared observer target owned by another nested Fragment', async () => {
    const parentRef = React.createRef();
    const childRef = React.createRef();
    const activeTargets = new Set();
    const observer = {
      observe: jest.fn(target => activeTargets.add(target)),
      unobserve: jest.fn(target => activeTargets.delete(target)),
    };

    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(
        <Fragment ref={parentRef}>
          <Fragment ref={childRef}>
            <div id="shared-target" />
          </Fragment>
        </Fragment>,
      );
    });

    const target = container.querySelector('#shared-target');
    parentRef.current.observeUsing(observer);
    childRef.current.observeUsing(observer);
    expect(activeTargets.has(target)).toBe(true);

    childRef.current.unobserveUsing(observer);

    expect(activeTargets.has(target)).toBe(true);

    parentRef.current.unobserveUsing(observer);
    expect(activeTargets.has(target)).toBe(false);
  });

  // @gate enableFragmentRefs
  it('preserves direct observer ownership behavior outside Fragment refs', async () => {
    const fragmentRef = React.createRef();
    const activeTargets = new Set();
    const observer = {
      observe: jest.fn(target => activeTargets.add(target)),
      unobserve: jest.fn(target => activeTargets.delete(target)),
    };

    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(
        <Fragment ref={fragmentRef}>
          <div id="shared-target" />
        </Fragment>,
      );
    });

    const target = container.querySelector('#shared-target');
    observer.observe(target);
    fragmentRef.current.observeUsing(observer);
    expect(activeTargets.has(target)).toBe(true);

    // React cannot observe direct/manual ownership. The last known Fragment
    // owner keeps the existing platform semantics and calls unobserve().
    fragmentRef.current.unobserveUsing(observer);
    expect(activeTargets.has(target)).toBe(false);
  });
});
