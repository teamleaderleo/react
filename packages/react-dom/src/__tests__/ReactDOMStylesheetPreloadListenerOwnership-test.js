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

describe('stylesheet preload listener ownership', () => {
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
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not let a stale preload event settle the inserted stylesheet wait', () => {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'style';
    preload.href = '/style.css';

    const resource = {
      type: 'stylesheet',
      instance: null,
      count: 0,
      state: {
        loading: 0,
        preload,
      },
    };
    const props = {
      rel: 'stylesheet',
      href: '/style.css',
      precedence: 'default',
    };
    const state = startSuspendingCommit();

    suspendResource(state, document, resource, props);
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    const commit = jest.fn();
    const cancel = subscribe(commit);

    // The preload legitimately settles first. React then inserts the real
    // stylesheet and transfers the suspended commit to that stylesheet load.
    preload.dispatchEvent(new Event('load'));
    expect(commit).not.toHaveBeenCalled();
    expect(resource.instance).not.toBe(null);

    // A later event from the already-settled preload no longer owns this
    // SuspendedState count. Current source is expected to decrement the new
    // stylesheet wait here and resume too early.
    preload.dispatchEvent(new Event('error'));
    expect(commit).not.toHaveBeenCalled();

    resource.instance.dispatchEvent(new Event('load'));
    expect(commit).toHaveBeenCalledTimes(1);

    cancel();
  });
});
