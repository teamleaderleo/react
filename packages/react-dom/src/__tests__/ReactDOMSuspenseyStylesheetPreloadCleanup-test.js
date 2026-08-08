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

function createPendingStylesheetWait() {
  const state = startSuspendingCommit();
  const instance = document.createElement('link');
  instance.rel = 'stylesheet';
  instance.href = '/fieldwork-style.css';

  const preload = document.createElement('link');
  preload.rel = 'preload';
  preload.as = 'style';
  preload.href = '/fieldwork-style.css';

  const resource = {
    type: 'stylesheet',
    instance,
    count: 1,
    state: {
      loading: 0,
      preload,
    },
  };

  suspendResource(state, document, resource, {
    href: '/fieldwork-style.css',
    precedence: 'default',
  });

  expect(state.count).toBe(1);
  return {preload, resource, state};
}

function expectTemporaryListenersRemoved(removeEventListener) {
  expect(removeEventListener).toHaveBeenCalledWith(
    'load',
    expect.any(Function),
  );
  expect(removeEventListener).toHaveBeenCalledWith(
    'error',
    expect.any(Function),
  );
}

describe('suspensey stylesheet preload listener cleanup', () => {
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
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('removes both temporary listeners after preload load settlement', () => {
    const {preload, state} = createPendingStylesheetWait();
    const removeEventListener = jest.spyOn(preload, 'removeEventListener');

    preload.dispatchEvent(new Event('load'));

    expect(state.count).toBe(0);
    expectTemporaryListenersRemoved(removeEventListener);

    preload.dispatchEvent(new Event('error'));
    expect(state.count).toBe(0);
  });

  it('removes both temporary listeners after preload error settlement', () => {
    const {preload, state} = createPendingStylesheetWait();
    const removeEventListener = jest.spyOn(preload, 'removeEventListener');

    preload.dispatchEvent(new Event('error'));

    expect(state.count).toBe(0);
    expectTemporaryListenersRemoved(removeEventListener);

    preload.dispatchEvent(new Event('load'));
    expect(state.count).toBe(0);
  });

  it('removes preload listeners when the stylesheet wait times out', () => {
    const {preload, state} = createPendingStylesheetWait();
    const removeEventListener = jest.spyOn(preload, 'removeEventListener');
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    let commitCount = 0;
    subscribe(() => commitCount++);
    jest.advanceTimersByTime(60000);

    expect(commitCount).toBe(1);
    expectTemporaryListenersRemoved(removeEventListener);

    const countAfterTimeout = state.count;
    preload.dispatchEvent(new Event('load'));
    expect(state.count).toBe(countAfterTimeout);
  });

  it('removes preload listeners when the suspended commit is cancelled', () => {
    const {preload, state} = createPendingStylesheetWait();
    const removeEventListener = jest.spyOn(preload, 'removeEventListener');
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    const cancel = subscribe(() => {});
    cancel();

    expectTemporaryListenersRemoved(removeEventListener);

    const countAfterCancel = state.count;
    preload.dispatchEvent(new Event('error'));
    expect(state.count).toBe(countAfterCancel);
  });
});
