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

// Mount the smallest valid Document-root Fragment used by every dispatch case.
function createDocumentRoot() {
  const fragmentRef = React.createRef();
  const root = ReactDOMClient.createRoot(document);
  return act(() => {
    root.render(
      <Fragment ref={fragmentRef}>
        <html>
          <head />
          <body />
        </html>
      </Fragment>,
    );
  }).then(() => ({fragmentRef, root}));
}

describe('FragmentRefs document dispatch', () => {
  beforeEach(() => {
    jest.resetModules();
    JSDOM = require('jsdom');
    React = require('react');
    Fragment = React.Fragment;
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
  it('dispatches a bubbling event from a top-level Fragment to its Document parent', async () => {
    const {fragmentRef} = await createDocumentRoot();
    const fragmentListener = jest.fn();
    const documentListener = jest.fn();
    fragmentRef.current.addEventListener('custom', fragmentListener);
    document.addEventListener('custom', documentListener);
    const childCountBeforeDispatch = document.childNodes.length;

    const result = fragmentRef.current.dispatchEvent(
      new Event('custom', {bubbles: true, cancelable: true}),
    );

    expect(result).toBe(true);
    expect(fragmentListener).toHaveBeenCalledTimes(1);
    expect(documentListener).toHaveBeenCalledTimes(1);
    expect(document.childNodes.length).toBe(childCountBeforeDispatch);
  });

  // @gate enableFragmentRefs
  it('preserves cancellation and non-bubbling dispatch semantics', async () => {
    const {fragmentRef} = await createDocumentRoot();
    const childCountBeforeDispatch = document.childNodes.length;

    const preventingListener = jest.fn(event => event.preventDefault());
    fragmentRef.current.addEventListener('prevented', preventingListener);
    const prevented = fragmentRef.current.dispatchEvent(
      new Event('prevented', {bubbles: true, cancelable: true}),
    );
    expect(prevented).toBe(false);
    expect(preventingListener).toHaveBeenCalledTimes(1);
    expect(document.childNodes.length).toBe(childCountBeforeDispatch);

    const fragmentListener = jest.fn();
    const documentListener = jest.fn();
    fragmentRef.current.addEventListener('nonbubbling', fragmentListener);
    document.addEventListener('nonbubbling', documentListener);
    const nonBubbling = fragmentRef.current.dispatchEvent(
      new Event('nonbubbling', {bubbles: false, cancelable: true}),
    );
    expect(nonBubbling).toBe(true);
    expect(fragmentListener).toHaveBeenCalledTimes(1);
    expect(documentListener).not.toHaveBeenCalled();
    expect(document.childNodes.length).toBe(childCountBeforeDispatch);
  });
});
