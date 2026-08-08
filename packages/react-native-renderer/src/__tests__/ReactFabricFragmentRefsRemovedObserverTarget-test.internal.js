/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

let React;
let ReactFabric;
let createReactNativeComponentClass;
let act;
let View;

describe('Fabric FragmentRefs removed observer targets', () => {
  beforeEach(() => {
    jest.resetModules();

    require('react-native/Libraries/ReactPrivate/InitializeNativeFabricUIManager');

    React = require('react');
    ReactFabric = require('react-native-renderer/fabric');
    createReactNativeComponentClass =
      require('react-native/react-private-interface')
        .ReactNativeViewConfigRegistry.register;
    ({act} = require('internal-test-utils'));
    View = createReactNativeComponentClass('RCTView', () => ({
      validAttributes: {nativeID: true},
      uiViewClassName: 'RCTView',
    }));
  });

  // @gate enableFragmentRefs
  it('does not leave a removed child observed after the Fragment releases the observer', async () => {
    const fragmentRef = React.createRef();
    const activeTargets = new Set();
    const observer = {
      observe: jest.fn(target => activeTargets.add(target)),
      unobserve: jest.fn(target => activeTargets.delete(target)),
    };

    function App({showA}) {
      return (
        <View nativeID="parent">
          <React.Fragment ref={fragmentRef}>
            {showA ? <View nativeID="A" /> : null}
            <View nativeID="B" />
          </React.Fragment>
        </View>
      );
    }

    await act(() =>
      ReactFabric.render(<App showA={true} />, 11, null, true),
    );

    fragmentRef.current.observeUsing(observer);
    expect(activeTargets.size).toBe(2);

    // Remove A while the Fragment and its observer registration stay live.
    // Current Fabric deletion does not retire observer ownership for A.
    await act(() =>
      ReactFabric.render(<App showA={false} />, 11, null, true),
    );

    // Releasing the Fragment's observer must leave no target that was owned by
    // that Fragment. A traversal of only current children cannot reach removed A.
    fragmentRef.current.unobserveUsing(observer);
    expect(activeTargets.size).toBe(0);
  });
});
