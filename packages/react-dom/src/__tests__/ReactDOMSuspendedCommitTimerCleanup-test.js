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
let suspendInstance;
let waitForCommitToBeReady;

function createPendingImage() {
  let resolveDecode;
  const decodePromise = new Promise(resolve => {
    resolveDecode = resolve;
  });
  const image = document.createElement('img');
  image.width = 10;
  image.height = 10;
  Object.defineProperty(image, 'complete', {
    configurable: true,
    value: false,
  });
  image.decode = jest.fn(() => decodePromise);
  return {image, resolveDecode};
}

describe('suspended commit timer cleanup', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    ({
      startSuspendingCommit,
      suspendInstance,
      waitForCommitToBeReady,
    } = require('react-dom-bindings/src/client/ReactFiberConfigDOM'));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('clears commit timeout owners before normal image readiness resumes', async () => {
    const {image, resolveDecode} = createPendingImage();
    const state = startSuspendingCommit();

    suspendInstance(state, image, 'img', {});
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    let timersAtCommit = -1;
    const commit = jest.fn(() => {
      timersAtCommit = jest.getTimerCount();
    });
    const cancel = subscribe(commit);

    expect(commit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(2);

    resolveDecode();
    await Promise.resolve();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(timersAtCommit).toBe(0);
    expect(jest.getTimerCount()).toBe(0);

    cancel();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears the stylesheet timeout owner when the image timeout resumes', () => {
    const {image} = createPendingImage();
    const state = startSuspendingCommit();

    suspendInstance(state, image, 'img', {});
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    let timersAtCommit = -1;
    const commit = jest.fn(() => {
      timersAtCommit = jest.getTimerCount();
    });
    const cancel = subscribe(commit);

    expect(jest.getTimerCount()).toBe(2);
    jest.advanceTimersByTime(800);

    expect(commit).toHaveBeenCalledTimes(1);
    expect(timersAtCommit).toBe(0);
    expect(jest.getTimerCount()).toBe(0);

    cancel();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps explicit cancellation cleanup idempotent', () => {
    const {image} = createPendingImage();
    const state = startSuspendingCommit();

    suspendInstance(state, image, 'img', {});
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    const commit = jest.fn();
    const cancel = subscribe(commit);

    expect(jest.getTimerCount()).toBe(2);
    cancel();
    expect(jest.getTimerCount()).toBe(0);
    cancel();

    expect(commit).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
