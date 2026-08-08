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

describe('ReactDOM ViewTransition finished cleanup', () => {
  beforeEach(() => {
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
  });

  // @gate enableViewTransition
  it('does not recreate a rejected child from a handled finished promise', async () => {
    let rejectFinished;
    const sourceFinished = new Promise((resolve, reject) => {
      rejectFinished = reject;
    });
    // The platform marks ViewTransition.finished handled so that an update
    // callback rejection does not create a duplicate unhandledrejection.
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

    // Track the Promise returned by whichever registration primitive React
    // chooses. This makes the regression deterministic instead of relying on
    // the test runner's process-wide unhandled-rejection behavior.
    const finished = {
      then(onFulfilled, onRejected) {
        return trackChild(
          'then',
          sourceFinished.then(onFulfilled, onRejected),
        );
      },
      finally(onFinally) {
        return trackChild('finally', sourceFinished.finally(onFinally));
      },
    };

    document.startViewTransition = function ({update}) {
      update();
      return {
        ready: Promise.resolve(),
        finished,
        skipTransition() {},
      };
    };

    const cleanup = jest.fn();
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

    expect(cleanup).not.toHaveBeenCalled();

    const rejection = new Error('view transition update failed');
    await act(async () => {
      rejectFinished(rejection);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(
      childSettlements.filter(settlement => settlement.status === 'rejected'),
    ).toEqual([]);
  });
});
