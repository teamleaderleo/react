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
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const {image, resolveDecode} = createPendingImage();
    const state = startSuspendingCommit();

    suspendInstance(state, image, 'img', {});
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    let clearsAtCommit = -1;
    const commit = jest.fn(() => {
      clearsAtCommit = clearTimeoutSpy.mock.calls.length;
    });
    const cancel = subscribe(commit);

    expect(commit).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).not.toHaveBeenCalled();

    resolveDecode();
    await Promise.resolve();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(clearsAtCommit).toBe(2);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);

    cancel();
  });

  it('keeps explicit cancellation cleanup idempotent', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const {image} = createPendingImage();
    const state = startSuspendingCommit();

    suspendInstance(state, image, 'img', {});
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');

    const commit = jest.fn();
    const cancel = subscribe(commit);

    cancel();

    expect(commit).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });
});
