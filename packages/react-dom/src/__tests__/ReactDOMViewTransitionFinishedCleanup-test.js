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
let ViewTransition;
let act;
let startTransition;
let container;
let originalGetBoundingClientRect;
let originalGetAnimations;
let originalAnimate;
let originalStartViewTransition;
let originalReportError;

describe('ReactDOM ViewTransition finished cleanup', () => {
  beforeEach(() => {
    originalReportError = global.reportError;
    global.reportError = jest.fn();

    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;
    ViewTransition = React.ViewTransition;
    startTransition = React.startTransition;

    container = document.createElement('div');
    document.body.appendChild(container);

    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    originalGetAnimations = Element.prototype.getAnimations;
    originalAnimate = Element.prototype.animate;
    originalStartViewTransition = document.startViewTransition;

    if (typeof CSS === 'undefined') {
      global.CSS = {escape: str => str};
    } else if (!CSS.escape) {
      CSS.escape = str => str;
    }

    if (!document.fonts) {
      Object.defineProperty(document, 'fonts', {
        value: {status: 'loaded', ready: Promise.resolve()},
        configurable: true,
      });
    }

    Element.prototype.getAnimations = function () {
      return [];
    };
    Element.prototype.animate = function () {
      return {cancel() {}, finished: Promise.resolve()};
    };
    Element.prototype.getBoundingClientRect = function () {
      const text = this.textContent || '';
      return new DOMRect(0, 0, text.length * 10 + 10, 20);
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    Element.prototype.getAnimations = originalGetAnimations;
    Element.prototype.animate = originalAnimate;
    if (originalStartViewTransition) {
      document.startViewTransition = originalStartViewTransition;
    } else {
      delete document.startViewTransition;
    }
    if (originalReportError === undefined) {
      delete global.reportError;
    } else {
      global.reportError = originalReportError;
    }
  });

  function createTrackedFinished() {
    let resolveFinished;
    let rejectFinished;
    const sourceFinished = new Promise((resolve, reject) => {
      resolveFinished = resolve;
      rejectFinished = reject;
    });
    sourceFinished.catch(() => {});

    const childSettlements = [];
    function trackChild(method, child) {
      child.then(
        () => {
          childSettlements.push({method, status: 'fulfilled'});
        },
        reason => {
          childSettlements.push({method, status: 'rejected', reason});
        },
      );
      return child;
    }

    return {
      finished: {
        then(onFulfilled, onRejected) {
          return trackChild(
            'then',
            sourceFinished.then(onFulfilled, onRejected),
          );
        },
        finally(onFinally) {
          return trackChild('finally', sourceFinished.finally(onFinally));
        },
      },
      resolveFinished,
      rejectFinished,
      childSettlements,
    };
  }

  function installViewTransition(finished) {
    document.startViewTransition = function ({update}) {
      update();
      return {
        ready: Promise.resolve(),
        finished,
        skipTransition() {},
      };
    };
  }

  async function renderEnteringViewTransition(cleanup) {
    function App({show}) {
      if (!show) {
        return null;
      }
      return (
        <ViewTransition onEnter={() => cleanup}>
          <div>Hello</div>
        </ViewTransition>
      );
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<App show={false} />);
    });
    await act(() => {
      startTransition(() => {
        root.render(<App show={true} />);
      });
    });
  }

  async function flushPromiseSettlements() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  // @gate enableViewTransition
  it('does not recreate a rejected child from a handled finished promise', async () => {
    const {finished, rejectFinished, childSettlements} =
      createTrackedFinished();
    installViewTransition(finished);

    const cleanup = jest.fn();
    await renderEnteringViewTransition(cleanup);
    expect(cleanup).not.toHaveBeenCalled();

    rejectFinished(new Error('view transition update failed'));
    await flushPromiseSettlements();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(
      childSettlements.filter(settlement => settlement.status === 'rejected'),
    ).toEqual([]);
  });

  // @gate enableViewTransition
  it('reports a throwing cleanup without rejecting the registration child', async () => {
    const {finished, resolveFinished, childSettlements} =
      createTrackedFinished();
    installViewTransition(finished);

    const cleanupError = new Error('view transition cleanup failed');
    const cleanup = jest.fn(() => {
      throw cleanupError;
    });
    await renderEnteringViewTransition(cleanup);
    expect(cleanup).not.toHaveBeenCalled();

    resolveFinished();
    await flushPromiseSettlements();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(global.reportError).toHaveBeenCalledWith(cleanupError);
    expect(
      childSettlements.filter(settlement => settlement.status === 'rejected'),
    ).toEqual([]);
  });

  // @gate enableViewTransition
  it('runs a normal cleanup once when finished fulfills', async () => {
    const {finished, resolveFinished, childSettlements} =
      createTrackedFinished();
    installViewTransition(finished);

    const cleanup = jest.fn();
    await renderEnteringViewTransition(cleanup);
    resolveFinished();
    await flushPromiseSettlements();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(global.reportError).not.toHaveBeenCalled();
    expect(
      childSettlements.filter(settlement => settlement.status === 'rejected'),
    ).toEqual([]);
  });
});
