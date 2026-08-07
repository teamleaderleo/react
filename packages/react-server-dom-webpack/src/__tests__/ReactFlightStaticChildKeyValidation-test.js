/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.WritableStream =
  require('web-streams-polyfill/ponyfill/es6').WritableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

const {
  patchMessageChannel,
} = require('../../../../scripts/jest/patchMessageChannel');

let clientExports;
let webpackMap;
let act;
let assertConsoleErrorDev;
let serverAct;
let React;
let ReactDOMClient;
let ReactServerDOMServer;
let ReactServerDOMClient;
let ReactServerScheduler;
let use;

describe('ReactFlight static child key validation', () => {
  beforeEach(() => {
    jest.resetModules();

    ReactServerScheduler = require('scheduler');
    patchMessageChannel(ReactServerScheduler);
    serverAct = require('internal-test-utils').serverAct;

    jest.mock('react', () => require('react/react.react-server'));
    jest.mock('react-server-dom-webpack/server', () =>
      require('react-server-dom-webpack/server.browser'),
    );

    const WebpackMock = require('./utils/WebpackMock');
    clientExports = WebpackMock.clientExports;
    webpackMap = WebpackMock.webpackMap;
    ReactServerDOMServer = require('react-server-dom-webpack/server');

    __unmockReact();
    jest.resetModules();
    patchMessageChannel();

    ({act, assertConsoleErrorDev} = require('internal-test-utils'));
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactServerDOMClient = require('react-server-dom-webpack/client');
    use = React.use;
  });

  async function renderWithPadding(paddingLength) {
    const ClientForm = clientExports(function ClientForm({
      padding,
      elementsAfterSubmitButton,
    }) {
      return (
        <div>
          <button type="button">Send me details</button>
          {elementsAfterSubmitButton}
        </div>
      );
    });

    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        <ClientForm
          padding={'x'.repeat(paddingLength)}
          elementsAfterSubmitButton={<div>Prefer a chat?</div>}
        />,
        webpackMap,
      ),
    );
    const response = ReactServerDOMClient.createFromReadableStream(stream);

    function ClientRoot() {
      return use(response);
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<ClientRoot />);
    });

    return container.innerHTML;
  }

  it('does not warn for an inline static child below the row-size threshold', async () => {
    expect(await renderWithPadding(2500)).toBe(
      '<div><button type="button">Send me details</button><div>Prefer a chat?</div></div>',
    );
  });

  it('does not manufacture a missing-key warning when the same static child is deferred', async () => {
    expect(await renderWithPadding(4000)).toBe(
      '<div><button type="button">Send me details</button><div>Prefer a chat?</div></div>',
    );
  });

  it('still warns for a genuine dynamic list without keys', async () => {
    const DynamicList = clientExports(function DynamicList({items}) {
      return <div>{items.map(item => <span>{item}</span>)}</div>;
    });

    const stream = await serverAct(() =>
      ReactServerDOMServer.renderToReadableStream(
        <DynamicList items={['A', 'B']} />,
        webpackMap,
      ),
    );
    const response = ReactServerDOMClient.createFromReadableStream(stream);

    function ClientRoot() {
      return use(response);
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<ClientRoot />);
    });

    assertConsoleErrorDev([
      'Each child in a list should have a unique "key" prop.\n\n' +
        'Check the render method of `DynamicList`. See https://react.dev/link/warning-keys for more information.\n' +
        '    in span (at **)\n' +
        '    in DynamicList (at **)',
    ]);
  });
});
