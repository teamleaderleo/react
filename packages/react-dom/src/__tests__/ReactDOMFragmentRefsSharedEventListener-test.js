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

describe('FragmentRefs shared event listener ownership', () => {
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
  it('keeps a shared native listener while another Fragment still owns it', async () => {
    const parentRef = React.createRef();
    const childRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <Fragment ref={parentRef}>
          <Fragment ref={childRef}>
            <button id="shared">Shared</button>
          </Fragment>
        </Fragment>,
      );
    });

    let calls = 0;
    function listener() {
      calls++;
    }

    parentRef.current.addEventListener('click', listener);
    childRef.current.addEventListener('click', listener);

    // Both Fragment registrations target the same EventTarget identity, so the
    // platform correctly stores only one native listener.
    document.getElementById('shared').click();
    expect(calls).toBe(1);

    // Releasing the child Fragment must not cancel the parent Fragment's still-
    // live logical registration for the same native listener identity.
    childRef.current.removeEventListener('click', listener);
    document.getElementById('shared').click();
    expect(calls).toBe(2);

    parentRef.current.removeEventListener('click', listener);
    document.getElementById('shared').click();
    expect(calls).toBe(2);
  });
});
