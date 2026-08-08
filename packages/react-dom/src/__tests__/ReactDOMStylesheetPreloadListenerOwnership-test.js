/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let startSuspendingCommit;
let suspendResource;
let waitForCommitToBeReady;

function trackTemporaryListeners(target) {
  const active = {
    load: new Set(),
    error: new Set(),
  };
  const addEventListener = target.addEventListener.bind(target);
  const removeEventListener = target.removeEventListener.bind(target);

  jest
    .spyOn(target, 'addEventListener')
    .mockImplementation((type, listener, options) => {
      if (type === 'load' || type === 'error') {
        active[type].add(listener);
      }
      return addEventListener(type, listener, options);
    });
  jest
    .spyOn(target, 'removeEventListener')
    .mockImplementation((type, listener, options) => {
      if (type === 'load' || type === 'error') {
        active[type].delete(listener);
      }
      return removeEventListener(type, listener, options);
    });

  return active;
}

function createStylesheetWait(href) {
  const preload = document.createElement('link');
  preload.rel = 'preload';
  preload.as = 'style';
  preload.href = href;
  const preloadListeners = trackTemporaryListeners(preload);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = href;
  stylesheet.setAttribute('data-precedence', 'default');
  const stylesheetListeners = trackTemporaryListeners(stylesheet);

  const resource = {
    type: 'stylesheet',
    instance: stylesheet,
    count: 0,
    state: {
      loading: 0,
      preload,
    },
  };
  const props = {
    rel: 'stylesheet',
    href,
    precedence: 'default',
  };
  const state = startSuspendingCommit();

  suspendResource(state, document, resource, props);
  const subscribe = waitForCommitToBeReady(state, 0);
  expect(typeof subscribe).toBe('function');

  return {
    preload,
    preloadListeners,
    resource,
    state,
    stylesheet,
    stylesheetListeners,
    subscribe,
  };
}

function expectListenerCounts(activeListeners, load, error) {
  expect(activeListeners.load.size).toBe(load);
  expect(activeListeners.error.size).toBe(error);
}

describe('stylesheet suspended-commit listener ownership', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    ({
      startSuspendingCommit,
      suspendResource,
      waitForCommitToBeReady,
    } = require('react-dom-bindings/src/client/ReactFiberConfigDOM'));
  });

  afterEach(() => {
    document
      .querySelectorAll('link[href^="/fieldwork-preload-"]')
      .forEach(node => node.remove());
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not let a stale preload event settle the inserted stylesheet wait', () => {
    const {preload, stylesheet, subscribe} = createStylesheetWait(
      '/fieldwork-preload-order.css',
    );
    const commit = jest.fn();
    const cancel = subscribe(commit);

    // The preload legitimately settles first. React then inserts the real
    // stylesheet and transfers the suspended commit to that stylesheet load.
    preload.dispatchEvent(new Event('load'));
    expect(commit).not.toHaveBeenCalled();
    expect(stylesheet.isConnected).toBe(true);

    // A later event from the already-settled preload no longer owns this
    // SuspendedState count. Current source is expected to decrement the new
    // stylesheet wait here and resume too early.
    preload.dispatchEvent(new Event('error'));
    expect(commit).not.toHaveBeenCalled();

    stylesheet.dispatchEvent(new Event('load'));
    expect(commit).toHaveBeenCalledTimes(1);

    cancel();
  });

  it('releases the inserted stylesheet listener pair after settlement', () => {
    const {preload, state, stylesheet, stylesheetListeners, subscribe} =
      createStylesheetWait('/fieldwork-preload-stylesheet-settle.css');
    const commit = jest.fn();
    const cancel = subscribe(commit);

    preload.dispatchEvent(new Event('load'));
    expectListenerCounts(stylesheetListeners, 1, 1);

    stylesheet.dispatchEvent(new Event('load'));
    expect(commit).toHaveBeenCalledTimes(1);
    expectListenerCounts(stylesheetListeners, 0, 0);

    const countAfterSettlement = state.count;
    stylesheet.dispatchEvent(new Event('error'));
    expect(state.count).toBe(countAfterSettlement);

    cancel();
  });

  it('removes preload listeners when the suspended commit is cancelled', () => {
    const {preload, preloadListeners, state, subscribe} = createStylesheetWait(
      '/fieldwork-preload-cancel.css',
    );
    const commit = jest.fn();
    const cancel = subscribe(commit);

    expectListenerCounts(preloadListeners, 1, 1);
    cancel();
    expectListenerCounts(preloadListeners, 0, 0);

    const countAfterCancel = state.count;
    preload.dispatchEvent(new Event('load'));
    preload.dispatchEvent(new Event('error'));

    expect(state.count).toBe(countAfterCancel);
    expect(commit).not.toHaveBeenCalled();
  });

  it('releases commit-local stylesheet listeners when the timeout gives up', () => {
    const {
      preload,
      preloadListeners,
      state,
      stylesheet,
      stylesheetListeners,
      subscribe,
    } = createStylesheetWait('/fieldwork-preload-timeout.css');
    const commit = jest.fn();
    const cancel = subscribe(commit);

    expectListenerCounts(preloadListeners, 1, 1);
    jest.advanceTimersByTime(60000);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(stylesheet.isConnected).toBe(true);
    expectListenerCounts(preloadListeners, 0, 0);
    expectListenerCounts(stylesheetListeners, 0, 0);

    const countAfterTimeout = state.count;
    preload.dispatchEvent(new Event('load'));
    preload.dispatchEvent(new Event('error'));
    stylesheet.dispatchEvent(new Event('load'));
    stylesheet.dispatchEvent(new Event('error'));
    expect(state.count).toBe(countAfterTimeout);

    cancel();
  });
});
