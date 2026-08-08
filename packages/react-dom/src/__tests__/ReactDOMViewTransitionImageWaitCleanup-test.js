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

  function trackTemporaryListeners(image) {
    const activeListeners = {
      load: new Set(),
      error: new Set(),
    };
    const addEventListener = image.addEventListener.bind(image);
    const removeEventListener = image.removeEventListener.bind(image);

    jest
      .spyOn(image, 'addEventListener')
      .mockImplementation((type, listener, options) => {
        if (type === 'load' || type === 'error') {
          activeListeners[type].add(listener);
        }
        return addEventListener(type, listener, options);
      });
    jest
      .spyOn(image, 'removeEventListener')
      .mockImplementation((type, listener, options) => {
        if (type === 'load' || type === 'error') {
          activeListeners[type].delete(listener);
        }
        return removeEventListener(type, listener, options);
      });

    return activeListeners;
  }

  function expectTemporaryListenerCounts(activeListeners, load, error) {
    expect(activeListeners.load.size).toBe(load);
    expect(activeListeners.error.size).toBe(error);
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

  it('removes both temporary listeners when the image loads', async () => {
    const image = createPendingImage();
    const activeListeners = trackTemporaryListeners(image);

    const updateResult = beginTransition([image]);
    expectTemporaryListenerCounts(activeListeners, 1, 1);

    image.dispatchEvent(new Event('load'));
    await updateResult;

    expectTemporaryListenerCounts(activeListeners, 0, 0);
  });

  it('removes both temporary listeners when the image errors', async () => {
    const image = createPendingImage();
    const activeListeners = trackTemporaryListeners(image);

    const updateResult = beginTransition([image]);
    expectTemporaryListenerCounts(activeListeners, 1, 1);

    image.dispatchEvent(new Event('error'));
    await updateResult;

    expectTemporaryListenerCounts(activeListeners, 0, 0);
  });

  it(
    'removes both temporary listeners when the transition wait times out',
    async () => {
      const image = createPendingImage();
      const activeListeners = trackTemporaryListeners(image);

      const updateResult = beginTransition([image]);
      expectTemporaryListenerCounts(activeListeners, 1, 1);

      jest.advanceTimersByTime(500);
      await updateResult;

      expectTemporaryListenerCounts(activeListeners, 0, 0);
    },
  );

  it(
    'removes earlier image listeners when the byte budget abandons image waits',
    () => {
      const first = createPendingImage();
      const tooLarge = createPendingImage(2000, 2000);
      const firstListeners = trackTemporaryListeners(first);
      const tooLargeListeners = trackTemporaryListeners(tooLarge);

      beginTransition([first, tooLarge]);

      expectTemporaryListenerCounts(firstListeners, 0, 0);
      expectTemporaryListenerCounts(tooLargeListeners, 0, 0);
    },
  );
});
