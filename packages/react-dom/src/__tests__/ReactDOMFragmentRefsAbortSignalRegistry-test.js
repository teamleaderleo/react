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

describe('FragmentRefs AbortSignal listener registry', () => {
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
  it('can re-register the same listener after its AbortSignal removes it', async () => {
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

    const calls = [];
    function listener(event) {
      calls.push(event.currentTarget.id);
    }

    const controller = new AbortController();
    fragmentRef.current.addEventListener('click', listener, {
      signal: controller.signal,
    });

    document.getElementById('first').click();
    expect(calls).toEqual(['first']);

    controller.abort();
    document.getElementById('first').click();
    expect(calls).toEqual(['first']);

    // Once the signal aborts, EventTarget no longer has this registration.
    // Adding the same type/callback/capture identity again must create a new
    // live registration rather than being suppressed by stale Fragment state.
    fragmentRef.current.addEventListener('click', listener);
    document.getElementById('first').click();
    expect(calls).toEqual(['first', 'first']);

    await act(() => {
      showSecondChild();
    });

    document.getElementById('second').click();
    expect(calls).toEqual(['first', 'first', 'second']);
  });

  // @gate enableFragmentRefs
  it('does not let an already-aborted signal poison later registration identity', async () => {
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

    const controller = new AbortController();
    controller.abort();

    fragmentRef.current.addEventListener('click', listener, {
      signal: controller.signal,
    });
    document.getElementById('child').click();
    expect(calls).toBe(0);

    fragmentRef.current.addEventListener('click', listener);
    document.getElementById('child').click();
    expect(calls).toBe(1);
  });

  // @gate enableFragmentRefs
  it('keeps explicit removal idempotent when the old signal aborts later', async () => {
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

    const controller = new AbortController();
    fragmentRef.current.addEventListener('click', listener, {
      signal: controller.signal,
    });
    fragmentRef.current.removeEventListener('click', listener);

    // A later abort from the old registration must not gain authority over a
    // newer registration of the same DOM listener identity.
    fragmentRef.current.addEventListener('click', listener);
    controller.abort();

    document.getElementById('child').click();
    expect(calls).toBe(1);
  });
});
