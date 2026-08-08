/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

jest.mock('react-devtools-shared/src/utils', () => ({
  ...jest.requireActual('react-devtools-shared/src/utils'),
  getIsReloadAndProfileSupported: () => false,
  getIfReloadedAndProfiling: () => false,
  onReloadAndProfile: () => {},
  onReloadAndProfileFlagsReset: () => {},
}));

describe('DevTools composed shutdown settlement', () => {
  function createHook(backends, unsubscribeFailure) {
    const listeners = new Map();
    return {
      backends,
      renderers: new Map(),
      rendererInterfaces: new Map(),
      hasUnsupportedRendererAttached: false,
      reactDevtoolsAgent: null,
      settings: null,
      resolveRNStyle: null,
      nativeStyleEditorValidAttributes: null,
      sub(event, listener) {
        let eventListeners = listeners.get(event);
        if (eventListeners === undefined) {
          eventListeners = [];
          listeners.set(event, eventListeners);
        }
        eventListeners.push(listener);
        return () => {
          const currentListeners = listeners.get(event);
          if (currentListeners !== undefined) {
            const index = currentListeners.indexOf(listener);
            if (index !== -1) {
              currentListeners.splice(index, 1);
            }
          }
          if (
            unsubscribeFailure !== undefined &&
            unsubscribeFailure.event === event
          ) {
            throw unsubscribeFailure.error;
          }
        };
      },
      emit(event, value) {
        const eventListeners = listeners.get(event);
        if (eventListeners === undefined) {
          return;
        }
        const currentListeners = Array.from(eventListeners);
        for (let i = 0; i < currentListeners.length; i++) {
          currentListeners[i](value);
        }
      },
    };
  }

  function createRealBackend(name, bridges, agents) {
    const Bridge = require('react-devtools-shared/src/bridge').default;
    const Agent = require('react-devtools-shared/src/backend/agent').default;
    const {initBackend} = require('react-devtools-shared/src/backend');

    class TrackingBridge extends Bridge {
      constructor(wall) {
        super(wall);
        bridges.push({name, bridge: this});
      }
    }

    class TrackingAgent extends Agent {
      constructor(...args) {
        super(...args);
        agents.push({name, agent: this});
      }
    }

    return {
      Agent: TrackingAgent,
      Bridge: TrackingBridge,
      initBackend,
      setupNativeStyleEditor: null,
    };
  }

  function installHook(hook) {
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      configurable: true,
      value: hook,
    });
  }

  function dispatchWelcome() {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: {source: 'react-devtools-content-script'},
      }),
    );
  }

  it('settles backend cleanup, Bridge, Agent, and manager after one backend cleanup fails', () => {
    jest.resetModules();
    delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;

    const bridges = [];
    const agents = [];
    const backends = new Map();
    backends.set(
      'backend-a',
      createRealBackend('backend-a', bridges, agents),
    );
    backends.set(
      'backend-b',
      createRealBackend('backend-b', bridges, agents),
    );
    const hook = createHook(backends);
    installHook(hook);

    const reportedErrors = [];
    const onError = event => {
      reportedErrors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);

    try {
      require('../backendManager');
      dispatchWelcome();

      expect(bridges.map(entry => entry.name)).toEqual([
        'backend-a',
        'backend-b',
      ]);
      expect(agents.map(entry => entry.name)).toEqual([
        'backend-a',
        'backend-b',
      ]);
      expect(window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__).toBe(true);

      const probeCalls = [];
      for (let i = 0; i < agents.length; i++) {
        const {name, agent} = agents[i];
        agent.addListener('fieldwork-probe', () => {
          probeCalls.push(name);
        });
      }

      const cleanupError = new Error('renderer cleanup failed once');
      let cleanupCalls = 0;
      hook.rendererInterfaces.set(1, {
        cleanup: jest.fn(() => {
          cleanupCalls++;
          if (cleanupCalls === 1) {
            throw cleanupError;
          }
        }),
        flushInitialOperations: jest.fn(),
      });

      let thrownError = null;
      try {
        window.dispatchEvent(new Event('pagehide'));
      } catch (error) {
        thrownError = error;
      }

      expect(cleanupCalls).toBe(2);
      expect(bridges).toHaveLength(2);
      for (let i = 0; i < bridges.length; i++) {
        expect(() => bridges[i].bridge.send('late-message')).toThrow(
          'Cannot send a message through a Bridge that has been shut down.',
        );
      }

      for (let i = 0; i < agents.length; i++) {
        agents[i].agent.emit('fieldwork-probe');
      }
      expect(probeCalls).toEqual([]);

      expect(hook.reactDevtoolsAgent).toBe(null);
      expect(window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__).toBe(
        undefined,
      );
      expect(
        thrownError === cleanupError || reportedErrors.includes(cleanupError),
      ).toBe(true);
    } finally {
      if (window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__) {
        try {
          window.dispatchEvent(new Event('pagehide'));
        } catch (error) {}
      }
      window.removeEventListener('error', onError);
      delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;
    }
  });

  it('finishes the manager when direct backend shutdown reports setup cleanup failure', () => {
    jest.resetModules();
    delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;

    const bridges = [];
    const agents = [];
    const backends = new Map();
    backends.set(
      'backend-a',
      createRealBackend('backend-a', bridges, agents),
    );
    const setupCleanupError = new Error(
      'backend installation subscription cleanup failed',
    );
    const hook = createHook(backends, {
      event: 'devtools-backend-installed',
      error: setupCleanupError,
    });
    installHook(hook);

    try {
      require('../backendManager');
      dispatchWelcome();
      expect(bridges).toHaveLength(1);
      expect(window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__).toBe(true);

      expect(() => bridges[0].bridge.shutdown()).toThrow(setupCleanupError);

      expect(hook.reactDevtoolsAgent).toBe(null);
      expect(window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__).toBe(
        undefined,
      );
      expect(() => bridges[0].bridge.send('late-message')).toThrow(
        'Cannot send a message through a Bridge that has been shut down.',
      );
    } finally {
      if (window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__) {
        try {
          window.dispatchEvent(new Event('pagehide'));
        } catch (error) {}
      }
      delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;
    }
  });
});
