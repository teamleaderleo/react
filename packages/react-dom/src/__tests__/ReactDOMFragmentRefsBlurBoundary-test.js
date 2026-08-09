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
let ReactDOM;
let ReactDOMClient;
let act;
let container;
let Fragment;

describe('FragmentRefs blur across host boundaries', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    Fragment = React.Fragment;
    ReactDOM = require('react-dom');
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // @gate enableFragmentRefs
  it('blurs a focused portaled child that belongs to the Fragment', async () => {
    const fragmentRef = React.createRef();
    const portalContainer = document.createElement('div');
    document.body.appendChild(portalContainer);
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(
        <div id="fragment-parent">
          <Fragment ref={fragmentRef}>
            {ReactDOM.createPortal(
              <input id="portaled-input" />,
              portalContainer,
            )}
          </Fragment>
        </div>,
      );
    });

    const input = document.getElementById('portaled-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    fragmentRef.current.blur();

    expect(document.activeElement).not.toBe(input);
  });

  // @gate enableFragmentRefs
  it('blurs a focused child inside a ShadowRoot Fragment container', async () => {
    const fragmentRef = React.createRef();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({mode: 'open'});
    const root = ReactDOMClient.createRoot(shadowRoot);

    await act(() => {
      root.render(
        <Fragment ref={fragmentRef}>
          <input id="shadow-input" />
        </Fragment>,
      );
    });

    const input = shadowRoot.querySelector('#shadow-input');
    input.focus();
    expect(shadowRoot.activeElement).toBe(input);
    expect(document.activeElement).toBe(host);

    fragmentRef.current.blur();

    expect(shadowRoot.activeElement).not.toBe(input);
  });
});
