/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

let JSDOM;
let React;
let ReactDOMClient;
let act;
let document;

describe('html HostSingleton opaque child content', () => {
  beforeEach(() => {
    jest.resetModules();
    JSDOM = require('jsdom');
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;

    const jsdom = new JSDOM.JSDOM(
      '<!DOCTYPE html><html><head><title>outside</title></head><body><div id="outside">outside</div></body></html>',
    );
    document = jsdom.window.document;
    global.window = jsdom.window;
    global.document = document;
    global.navigator = jsdom.window.navigator;
    global.Event = jsdom.window.Event;
  });

  it('preserves the persistent head and body identities when html owns direct HTML', async () => {
    const documentElement = document.documentElement;
    const head = document.head;
    const body = document.body;
    const root = ReactDOMClient.createRoot(document);

    await act(() => {
      root.render(
        <html
          dangerouslySetInnerHTML={{
            __html:
              '<head><title>managed</title></head><body><div id="managed">managed</div></body>',
          }}
        />,
      );
    });

    expect(document.documentElement).toBe(documentElement);
    expect(document.getElementById('managed')).not.toBe(null);
    expect(document.head).toBe(head);
    expect(document.body).toBe(body);
  });
});
