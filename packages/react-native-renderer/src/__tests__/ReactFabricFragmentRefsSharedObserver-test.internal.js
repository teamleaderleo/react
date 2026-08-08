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

describe('Fabric FragmentRefs shared observer ownership', () => {
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
  it('keeps a shared target observed while another Fragment still owns it', async () => {
    const parentRef = React.createRef();
    const childRef = React.createRef();
    const activeTargets = new Set();
    const observer = {
      observe: jest.fn(target => activeTargets.add(target)),
      unobserve: jest.fn(target => activeTargets.delete(target)),
    };

    await act(() =>
      ReactFabric.render(
        <View nativeID="parent">
          <React.Fragment ref={parentRef}>
            <React.Fragment ref={childRef}>
              <View nativeID="shared" />
            </React.Fragment>
          </React.Fragment>
        </View>,
        11,
        null,
        true,
      ),
    );

    parentRef.current.observeUsing(observer);
    childRef.current.observeUsing(observer);

    expect(observer.observe).toHaveBeenCalledTimes(2);
    expect(activeTargets.size).toBe(1);

    childRef.current.unobserveUsing(observer);

    // Releasing one logical Fragment owner must not cancel another live
    // Fragment owner of the same observer-target pair.
    expect(activeTargets.size).toBe(1);

    parentRef.current.unobserveUsing(observer);
    expect(activeTargets.size).toBe(0);
  });
});
