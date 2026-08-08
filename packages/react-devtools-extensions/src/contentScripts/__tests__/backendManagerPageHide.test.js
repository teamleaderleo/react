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

describe('DevTools backend manager pagehide shutdown', () => {
  function createHook(backends) {
    const listeners = new Map();
    return {
      backends,
      renderers: new Map(),
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
          if (currentListeners === undefined) {
            return;
          }
          const index = currentListeners.indexOf(listener);
          if (index !== -1) {
            currentListeners.splice(index, 1);
          }
        };
      },
      emit(event, value) {
        const eventListeners = listeners.get(event);
        if (eventListeners !== undefined) {
          const currentListeners = Array.from(eventListeners);
          for (let i = 0; i < currentListeners.length; i++) {
            currentListeners[i](value);
          }
        }
      },
    };
  }

  function createBackend(name, shutdowns, shutdownError) {
    class FakeBridge {
      constructor() {
        this.agent = null;
      }

      send() {}

      shutdown() {
        shutdowns.push(name);
        this.agent.emit('shutdown');
        if (shutdownError !== null) {
          throw shutdownError;
        }
      }
    }

    class FakeAgent {
      constructor(bridge) {
        this.listeners = new Map();
        bridge.agent = this;
      }

      addListener(event, listener) {
        let eventListeners = this.listeners.get(event);
        if (eventListeners === undefined) {
          eventListeners = [];
          this.listeners.set(event, eventListeners);
        }
        eventListeners.push(listener);
      }

      emit(event) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners !== undefined) {
          const currentListeners = Array.from(eventListeners);
          for (let i = 0; i < currentListeners.length; i++) {
            currentListeners[i]();
          }
        }
      }
    }

    return {
      Agent: FakeAgent,
      Bridge: FakeBridge,
      initBackend: jest.fn(),
      setupNativeStyleEditor: null,
    };
  }

  it('continues shutting down backends when one shutdown reports an error', () => {
    jest.resetModules();
    delete window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__;

    const shutdowns = [];
    const expectedError = new Error('backend A shutdown failed');
    const hook = createHook(
      new Map([
        ['backend-a', createBackend('backend-a', shutdowns, expectedError)],
        ['backend-b', createBackend('backend-b', shutdowns, null)],
      ]),
    );
    delete window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      configurable: true,
      value: hook,
    });

    const reportedErrors = [];
    const onError = event => {
      reportedErrors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);

    try {
      require('../backendManager');
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: {source: 'react-devtools-content-script'},
        }),
      );

      expect(window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__).toBe(true);

      let thrownError = null;
      try {
        window.dispatchEvent(new Event('pagehide'));
      } catch (error) {
        thrownError = error;
      }

      expect(shutdowns).toEqual(['backend-a', 'backend-b']);
      expect(window.__REACT_DEVTOOLS_BACKEND_MANAGER_INJECTED__).toBe(
        undefined,
      );
      expect(
        thrownError === expectedError || reportedErrors.includes(expectedError),
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
});
