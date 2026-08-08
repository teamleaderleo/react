/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let React;
let ReactDOMClient;
let act;
let container;
let Fragment;

function directChildren() {
  return Array.from(container.childNodes);
}

describe('FragmentRefs dispatch exception cleanup', () => {
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
    container.remove();
  });

  // @gate enableFragmentRefs
  it('removes the synthetic dispatch target when redispatching the active Event throws', async () => {
    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <Fragment ref={fragmentRef}>
          <div id="stable-child" />
        </Fragment>,
      );
    });

    // Any retained Fragment listener selects the synthetic-target dispatch path.
    const fragmentListener = jest.fn();
    fragmentRef.current.addEventListener('reentrant', fragmentListener);

    const childrenBefore = directChildren();
    let redispatchError = null;
    const parentListener = event => {
      try {
        fragmentRef.current.dispatchEvent(event);
      } catch (error) {
        redispatchError = error;
      }
    };
    container.addEventListener('reentrant', parentListener);

    const activeEvent = new Event('reentrant', {
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(activeEvent);

    expect(redispatchError).not.toBe(null);
    expect(redispatchError.name).toBe('InvalidStateError');

    // React's temporary target is an implementation detail. A native dispatch
    // exception must not leave it mounted beside the Fragment's real child.
    expect(directChildren()).toEqual(childrenBefore);
    expect(container.querySelector('#stable-child')).toBe(childrenBefore[0]);

    container.removeEventListener('reentrant', parentListener);
    fragmentRef.current.removeEventListener('reentrant', fragmentListener);
    root.unmount();
  });
});
