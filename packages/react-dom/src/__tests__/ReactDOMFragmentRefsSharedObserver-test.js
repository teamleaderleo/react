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

  function createTrackedObserver() {
    const activeTargets = new Set();
    const observer = {
      observe: jest.fn(target => activeTargets.add(target)),
      unobserve: jest.fn(target => activeTargets.delete(target)),
    };
    return {observer, activeTargets};
  }

  // @gate enableFragmentRefs
  it('preserves a shared observer target owned by another nested Fragment', async () => {
    const parentRef = React.createRef();
    const childRef = React.createRef();
    const {observer, activeTargets} = createTrackedObserver();

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

    // The parent Fragment still logically uses the same cached observer for
    // this target, so releasing only the child Fragment must not cancel it.
    expect(activeTargets.has(target)).toBe(true);
  });

  // @gate enableFragmentRefs
  it('releases a removed child when the Fragment is later unobserved', async () => {
    const fragmentRef = React.createRef();
    const {observer, activeTargets} = createTrackedObserver();
    const root = ReactDOMClient.createRoot(container);

    function App({showChild}) {
      return (
        <Fragment ref={fragmentRef}>
          {showChild ? <div id="removed-target" /> : null}
          <div id="remaining-target" />
        </Fragment>
      );
    }

    await act(() => {
      root.render(<App showChild={true} />);
    });
    const removedTarget = container.querySelector('#removed-target');
    const remainingTarget = container.querySelector('#remaining-target');
    fragmentRef.current.observeUsing(observer);
    expect(activeTargets.has(removedTarget)).toBe(true);
    expect(activeTargets.has(remainingTarget)).toBe(true);

    await act(() => {
      root.render(<App showChild={false} />);
    });

    // React intentionally leaves a removed child observed long enough for the
    // observer to report its removal transition.
    expect(activeTargets.has(removedTarget)).toBe(true);

    fragmentRef.current.unobserveUsing(observer);

    // Once the caller explicitly unobserves the Fragment, every target that
    // React observed for that Fragment should be released, including children
    // that were removed earlier and are no longer reachable by tree traversal.
    expect(activeTargets.has(removedTarget)).toBe(false);
    expect(activeTargets.has(remainingTarget)).toBe(false);
  });
});
