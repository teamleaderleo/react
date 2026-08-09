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

describe('FragmentRefs once listener re-registration', () => {
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
  it('can add the same listener again after once consumed the native registration', async () => {
    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <Fragment ref={fragmentRef}>
          <button id="child">Child</button>
        </Fragment>,
      );
    });

    let calls = 0;
    function listener() {
      calls++;
    }

    fragmentRef.current.addEventListener('click', listener, {once: true});

    document.getElementById('child').click();
    document.getElementById('child').click();
    expect(calls).toBe(1);

    // Native EventTarget removed the once registration after the first click.
    // A second add with the same listener identity must therefore create a new
    // registration on this current child.
    fragmentRef.current.addEventListener('click', listener, {once: true});

    document.getElementById('child').click();
    document.getElementById('child').click();
    expect(calls).toBe(2);
  });

  // @gate enableFragmentRefs
  it('rearms only a child whose once listener has already fired', async () => {
    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <Fragment ref={fragmentRef}>
          <button id="first">First</button>
          <button id="second">Second</button>
        </Fragment>,
      );
    });

    const calls = [];
    function listener(event) {
      calls.push(event.currentTarget.id);
    }

    fragmentRef.current.addEventListener('click', listener, {once: true});

    // Consume only the first child's registration. The second child still has
    // its original native once listener.
    document.getElementById('first').click();
    expect(calls).toEqual(['first']);

    // Re-applying the Fragment add should be a native no-op on the second child
    // while restoring the consumed registration on the first child.
    fragmentRef.current.addEventListener('click', listener, {once: true});

    document.getElementById('first').click();
    document.getElementById('second').click();
    document.getElementById('second').click();

    expect(calls).toEqual(['first', 'first', 'second']);
  });
});
