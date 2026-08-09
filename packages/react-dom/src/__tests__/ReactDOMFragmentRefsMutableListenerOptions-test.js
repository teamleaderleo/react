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

describe('FragmentRefs mutable event listener options', () => {
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
  it('snapshots capture identity when a listener is registered', async () => {
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
    const options = {capture: false};

    fragmentRef.current.addEventListener('click', listener, options);
    document.getElementById('child').click();
    expect(calls).toBe(1);

    // EventTarget snapshots capture at registration time. Mutating the caller's
    // options object later must not rewrite React's retained listener identity.
    options.capture = true;
    fragmentRef.current.removeEventListener('click', listener, false);

    document.getElementById('child').click();
    expect(calls).toBe(1);
  });

  // @gate enableFragmentRefs
  it('uses the original signal for children inserted after options mutate', async () => {
    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);
    let showSecondChild;

    function Test() {
      const [showSecond, setShowSecond] = React.useState(false);
      showSecondChild = () => setShowSecond(true);
      return (
        <Fragment ref={fragmentRef}>
          <button id="first">First</button>
          {showSecond && <button id="second">Second</button>}
        </Fragment>
      );
    }

    await act(() => {
      root.render(<Test />);
    });

    const firstController = new AbortController();
    const secondController = new AbortController();
    const options = {signal: firstController.signal};
    const calls = [];
    function listener(event) {
      calls.push(event.currentTarget.id);
    }

    fragmentRef.current.addEventListener('click', listener, options);

    // The retained Fragment registration should represent the values read by
    // the original addEventListener call, not future mutations of this object.
    options.signal = secondController.signal;
    await act(() => {
      showSecondChild();
    });

    firstController.abort();
    document.getElementById('first').click();
    document.getElementById('second').click();

    expect(calls).toEqual([]);
  });

  // @gate enableFragmentRefs
  it('uses the original once value for children inserted after options mutate', async () => {
    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);
    let showSecondChild;

    function Test() {
      const [showSecond, setShowSecond] = React.useState(false);
      showSecondChild = () => setShowSecond(true);
      return (
        <Fragment ref={fragmentRef}>
          <button id="first">First</button>
          {showSecond && <button id="second">Second</button>}
        </Fragment>
      );
    }

    await act(() => {
      root.render(<Test />);
    });

    const options = {once: true};
    let secondCalls = 0;
    function listener(event) {
      if (event.currentTarget.id === 'second') {
        secondCalls++;
      }
    }

    fragmentRef.current.addEventListener('click', listener, options);
    options.once = false;

    await act(() => {
      showSecondChild();
    });

    document.getElementById('second').click();
    document.getElementById('second').click();

    expect(secondCalls).toBe(1);
  });
});
