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
let Fragment;
let originalWindowScrollTo;

describe('FragmentRefs text scroll browsing context', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    Fragment = React.Fragment;
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;
    originalWindowScrollTo = window.scrollTo;
  });

  afterEach(() => {
    window.scrollTo = originalWindowScrollTo;
    document.body.innerHTML = '';
  });

  // @gate enableFragmentRefs && enableFragmentRefsTextNodes && enableFragmentRefsScrollIntoView
  it('scrolls the Window that owns a text child instead of the outer global Window', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeWindow = iframe.contentWindow;
    const iframeDocument = iframe.contentDocument;
    const mount = iframeDocument.createElement('div');
    iframeDocument.body.appendChild(mount);

    const fragmentRef = React.createRef();
    const root = ReactDOMClient.createRoot(mount);
    await act(() => {
      root.render(<Fragment ref={fragmentRef}>inside iframe</Fragment>);
    });

    const textNode = mount.firstChild;
    expect(textNode.nodeType).toBe(Node.TEXT_NODE);
    expect(textNode.ownerDocument).toBe(iframeDocument);

    const range = {
      selectNodeContents: jest.fn(),
      getBoundingClientRect: jest.fn(() => ({
        bottom: 40,
        height: 20,
        left: 5,
        right: 105,
        top: 20,
        width: 100,
        x: 5,
        y: 20,
        toJSON() {},
      })),
    };
    iframeDocument.createRange = jest.fn(() => range);

    const outerScrollTo = jest.fn();
    const iframeScrollTo = jest.fn();
    window.scrollTo = outerScrollTo;
    iframeWindow.scrollTo = iframeScrollTo;

    fragmentRef.current.scrollIntoView(true);

    expect(range.selectNodeContents).toHaveBeenCalledWith(textNode);
    expect(iframeScrollTo).toHaveBeenCalledTimes(1);
    expect(outerScrollTo).not.toHaveBeenCalled();
  });
});
