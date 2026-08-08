/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

describe('DevTools backend shutdown', () => {
  function createAgent() {
    const listeners = new Map();
    return {
      addListener(event, listener) {
        let eventListeners = listeners.get(event);
        if (eventListeners === undefined) {
          eventListeners = [];
          listeners.set(event, eventListeners);
        }
        eventListeners.push(listener);
      },
      registerRendererInterface: jest.fn(),
      onUnsupportedRenderer: jest.fn(),
      onFastRefreshScheduled: jest.fn(),
      onHookOperations: jest.fn(),
      onTraceUpdates: jest.fn(),
      onHookSettings: jest.fn(),
      onReloadAndProfileSupportedByHost: jest.fn(),
      emit(event) {
        const eventListeners = listeners.get(event);
        if (eventListeners === undefined) {
          return;
        }
        for (let i = 0; i < eventListeners.length; i++) {
          eventListeners[i]();
        }
      },
    };
  }

  function createHook(rendererInterfaces) {
    return {
      rendererInterfaces,
      hasUnsupportedRendererAttached: false,
      reactDevtoolsAgent: null,
      settings: null,
      sub: jest.fn(() => jest.fn()),
      emit: jest.fn(),
    };
  }

  it('continues renderer cleanup when one renderer cleanup throws', () => {
    const {initBackend} = require('react-devtools-shared/src/backend');
    const expectedError = new Error('renderer A cleanup failed');
    const cleanupA = jest.fn(() => {
      throw expectedError;
    });
    const cleanupB = jest.fn();
    const rendererA = {
      flushInitialOperations: jest.fn(),
      cleanup: cleanupA,
    };
    const rendererB = {
      flushInitialOperations: jest.fn(),
      cleanup: cleanupB,
    };
    const hook = createHook(
      new Map([
        [1, rendererA],
        [2, rendererB],
      ]),
    );
    const agent = createAgent();

    initBackend(hook, agent, {}, false);
    expect(hook.reactDevtoolsAgent).toBe(agent);

    expect(() => agent.emit('shutdown')).toThrow(expectedError);

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).toHaveBeenCalledTimes(1);
    expect(hook.reactDevtoolsAgent).toBe(null);
  });
});
