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

  function createHook(rendererInterfaces, unsubscribeFns) {
    let unsubscribeIndex = 0;
    return {
      rendererInterfaces,
      hasUnsupportedRendererAttached: false,
      reactDevtoolsAgent: null,
      settings: null,
      sub: jest.fn(() => {
        if (unsubscribeFns === undefined) {
          return jest.fn();
        }
        return unsubscribeFns[unsubscribeIndex++];
      }),
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
    const hook = createHook(
      new Map([
        [1, {flushInitialOperations: jest.fn(), cleanup: cleanupA}],
        [2, {flushInitialOperations: jest.fn(), cleanup: cleanupB}],
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

  it('continues backend cleanup when one hook unsubscribe throws', () => {
    const {initBackend} = require('react-devtools-shared/src/backend');
    const expectedError = new Error('unsubscribe A failed');
    const unsubscribeA = jest.fn(() => {
      throw expectedError;
    });
    const unsubscribeB = jest.fn();
    const unsubscribeC = jest.fn();
    const unsubscribeD = jest.fn();
    const unsubscribeE = jest.fn();
    const unsubscribeF = jest.fn();
    const cleanupRenderer = jest.fn();
    const hook = createHook(
      new Map([
        [
          1,
          {flushInitialOperations: jest.fn(), cleanup: cleanupRenderer},
        ],
      ]),
      [
        unsubscribeA,
        unsubscribeB,
        unsubscribeC,
        unsubscribeD,
        unsubscribeE,
        unsubscribeF,
      ],
    );
    const agent = createAgent();

    initBackend(hook, agent, {}, false);
    expect(hook.reactDevtoolsAgent).toBe(agent);
    expect(() => agent.emit('shutdown')).toThrow(expectedError);
    expect(unsubscribeA).toHaveBeenCalledTimes(1);
    expect(unsubscribeB).toHaveBeenCalledTimes(1);
    expect(unsubscribeC).toHaveBeenCalledTimes(1);
    expect(unsubscribeD).toHaveBeenCalledTimes(1);
    expect(unsubscribeE).toHaveBeenCalledTimes(1);
    expect(unsubscribeF).toHaveBeenCalledTimes(1);
    expect(cleanupRenderer).toHaveBeenCalledTimes(1);
    expect(hook.reactDevtoolsAgent).toBe(null);
  });

  it('preserves the first cleanup error and reports later failures', () => {
    const originalReportError = global.reportError;
    global.reportError = jest.fn();
    try {
      jest.resetModules();
      const {initBackend} = require('react-devtools-shared/src/backend');
      const firstError = new Error('unsubscribe failed first');
      const laterError = new Error('renderer cleanup failed later');
      const unsubscribeA = jest.fn(() => {
        throw firstError;
      });
      const unsubscribeRest = Array.from({length: 5}, () => jest.fn());
      const cleanupRenderer = jest.fn(() => {
        throw laterError;
      });
      const hook = createHook(
        new Map([
          [
            1,
            {flushInitialOperations: jest.fn(), cleanup: cleanupRenderer},
          ],
        ]),
        [unsubscribeA, ...unsubscribeRest],
      );
      const agent = createAgent();

      initBackend(hook, agent, {}, false);
      expect(() => agent.emit('shutdown')).toThrow(firstError);
      expect(cleanupRenderer).toHaveBeenCalledTimes(1);
      expect(global.reportError).toHaveBeenCalledWith(laterError);
      expect(hook.reactDevtoolsAgent).toBe(null);
    } finally {
      if (originalReportError === undefined) {
        delete global.reportError;
      } else {
        global.reportError = originalReportError;
      }
    }
  });
});
