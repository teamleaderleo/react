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

describe('FragmentRefs dispatch synthetic target cleanup', () => {
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
  it('does not leak a synthetic child when the same Event is reentrantly dispatched', async () => {
    const fragmentRef = React.createRef();
    const parentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <div ref={parentRef}>
          <Fragment ref={fragmentRef} />
        </div>,
      );
    });

    let reentrantError = null;
    fragmentRef.current.addEventListener('custom', event => {
      try {
        fragmentRef.current.dispatchEvent(event);
      } catch (error) {
        reentrantError = error;
      }
    });

    const childCountBefore = parentRef.current.childNodes.length;
    const result = fragmentRef.current.dispatchEvent(
      new Event('custom', {bubbles: false, cancelable: true}),
    );

    expect(result).toBe(true);
    expect(reentrantError).not.toBe(null);
    expect(reentrantError.name).toBe('InvalidStateError');
    expect(parentRef.current.childNodes.length).toBe(childCountBefore);
  });

  // @gate enableFragmentRefs
  it('does not fail cleanup when a Fragment listener detaches the synthetic currentTarget', async () => {
    const fragmentRef = React.createRef();
    const parentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <div ref={parentRef}>
          <Fragment ref={fragmentRef} />
        </div>,
      );
    });

    fragmentRef.current.addEventListener('custom', event => {
      const currentTarget = event.currentTarget;
      const parent = currentTarget.parentNode;
      expect(parent).not.toBe(null);
      parent.removeChild(currentTarget);
    });

    const childCountBefore = parentRef.current.childNodes.length;
    let dispatchError = null;
    try {
      fragmentRef.current.dispatchEvent(
        new Event('custom', {bubbles: false, cancelable: true}),
      );
    } catch (error) {
      dispatchError = error;
    }

    expect(dispatchError).toBe(null);
    expect(parentRef.current.childNodes.length).toBe(childCountBefore);
  });
});
