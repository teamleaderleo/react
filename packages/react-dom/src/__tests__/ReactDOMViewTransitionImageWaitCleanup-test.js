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
let waitForCommitToBeReady;
let startViewTransition;
let originalStartViewTransition;
let originalGetAnimations;
let originalFontsDescriptor;

function noop() {}

describe('ViewTransition image wait cleanup', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    ({
      startSuspendingCommit,
      waitForCommitToBeReady,
      startViewTransition,
    } = require('react-dom-bindings/src/client/ReactFiberConfigDOM'));

    originalStartViewTransition = document.startViewTransition;
    originalGetAnimations = Element.prototype.getAnimations;
    originalFontsDescriptor = Object.getOwnPropertyDescriptor(
      document,
      'fonts',
    );

    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        status: 'loaded',
        ready: Promise.resolve(),
      },
    });

    Element.prototype.getAnimations = function () {
      return [];
    };

    // Prime the same bandwidth estimate used by the pre-commit image path so
    // these tests exercise the ViewTransition image wait rather than the
    // conservative "unknown budget" fallback.
    const state = startSuspendingCommit();
    state.imgCount = 1;
    state.imgBytes = 1;
    const subscribe = waitForCommitToBeReady(state, 0);
    expect(typeof subscribe).toBe('function');
    const cancel = subscribe(noop);
    cancel();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    if (originalStartViewTransition === undefined) {
      delete document.startViewTransition;
    } else {
      document.startViewTransition = originalStartViewTransition;
    }
    Element.prototype.getAnimations = originalGetAnimations;

    if (originalFontsDescriptor === undefined) {
      delete document.fonts;
    } else {
      Object.defineProperty(document, 'fonts', originalFontsDescriptor);
    }
  });

  function createPendingImage(width = 10, height = 10) {
    const image = document.createElement('img');
    image.width = width;
    image.height = height;
    Object.defineProperty(image, 'complete', {
      configurable: true,
      value: false,
    });
    image.getBoundingClientRect = () => ({
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON() {},
    });
    return image;
  }

  function beginTransition(images) {
    let updateResult;
    document.startViewTransition = ({update}) => {
      updateResult = update();
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
        skipTransition() {},
      };
    };

    const suspendedState = startSuspendingCommit();
    suspendedState.suspenseyImages = images;

    startViewTransition(
      suspendedState,
      document,
      null,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );

    return updateResult;
  }

  function expectBothTemporaryListenersRemoved(removeEventListener) {
    expect(removeEventListener).toHaveBeenCalledWith(
      'load',
      expect.any(Function),
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
  }

  it('removes both temporary listeners when the image loads', async () => {
    const image = createPendingImage();
    const removeEventListener = jest.spyOn(image, 'removeEventListener');

    const updateResult = beginTransition([image]);
    image.dispatchEvent(new Event('load'));
    await updateResult;

    expectBothTemporaryListenersRemoved(removeEventListener);
  });

  it('removes both temporary listeners when the image errors', async () => {
    const image = createPendingImage();
    const removeEventListener = jest.spyOn(image, 'removeEventListener');

    const updateResult = beginTransition([image]);
    image.dispatchEvent(new Event('error'));
    await updateResult;

    expectBothTemporaryListenersRemoved(removeEventListener);
  });

  it('removes both temporary listeners when the transition wait times out', async () => {
    const image = createPendingImage();
    const removeEventListener = jest.spyOn(image, 'removeEventListener');

    const updateResult = beginTransition([image]);
    jest.advanceTimersByTime(500);
    await updateResult;

    expectBothTemporaryListenersRemoved(removeEventListener);
  });

  it(
    'removes earlier image listeners when the byte budget abandons image waits',
    () => {
      const first = createPendingImage();
      const tooLarge = createPendingImage(2000, 2000);
      const removeEventListener = jest.spyOn(first, 'removeEventListener');

      beginTransition([first, tooLarge]);

      expectBothTemporaryListenersRemoved(removeEventListener);
    },
  );
});
