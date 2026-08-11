'use strict';

var React = require('react');
var reactNativeKeyboardController = require('react-native-keyboard-controller');
var reactNativeReanimated = require('react-native-reanimated');
var reactNative = require('@legendapp/list/react-native');
var reanimated = require('@legendapp/list/reanimated');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespace(React);

// src/integrations/keyboard.tsx
var { typedForwardRef, useCombinedRef } = reactNative.internal;
if (typeof __DEV__ !== "undefined" && __DEV__ && !reactNativeKeyboardController.KeyboardChatScrollView) {
  console.warn(
    "[legend-list] KeyboardAwareLegendList requires a recent react-native-keyboard-controller with KeyboardChatScrollView. Please upgrade react-native-keyboard-controller to at least 1.21.7."
  );
}
function useKeyboardChatComposerInset(listRef, composerRef, initialHeight = 0) {
  const contentInsetEndAdjustment = reactNativeReanimated.useSharedValue(initialHeight);
  const lastHeightRef = React.useRef(void 0);
  const reportHeight = React.useCallback(
    (height) => {
      var _a;
      if (Number.isFinite(height) && height !== lastHeightRef.current) {
        lastHeightRef.current = height;
        contentInsetEndAdjustment.value = height;
        (_a = listRef.current) == null ? void 0 : _a.reportContentInset({ bottom: height });
      }
    },
    [contentInsetEndAdjustment, listRef]
  );
  React.useLayoutEffect(() => {
    var _a;
    (_a = composerRef.current) == null ? void 0 : _a.measure((_x, _y, _width, height) => {
      reportHeight(height);
    });
  }, [composerRef, reportHeight]);
  const onComposerLayout = React.useCallback(
    (event) => {
      reportHeight(event.nativeEvent.layout.height);
    },
    [reportHeight]
  );
  return { contentInsetEndAdjustment, onComposerLayout };
}
function useKeyboardScrollToEnd({ freeze: freezeProp, listRef }) {
  const internalFreeze = reactNativeReanimated.useSharedValue(false);
  const freeze = freezeProp != null ? freezeProp : internalFreeze;
  const scrollMessageToEnd = React.useCallback(
    async ({ animated, closeKeyboard }) => {
      const listRefCurrent = listRef.current;
      if (listRefCurrent) {
        freeze.set(true);
        const dismissPromise = closeKeyboard && reactNativeKeyboardController.KeyboardController.dismiss();
        const scrollPromise = listRefCurrent.scrollToEnd({ animated });
        await Promise.all([scrollPromise, dismissPromise]);
        freeze.set(false);
      }
    },
    [freeze, listRef]
  );
  return {
    freeze,
    scrollMessageToEnd
  };
}
var KeyboardAwareLegendList = typedForwardRef(function KeyboardAwareLegendList2(props, forwardedRef) {
  const {
    anchoredEndSpace,
    applyWorkaroundForContentInsetHitTestBug,
    contentInsetEndAdjustment,
    freeze,
    keyboardLiftBehavior,
    keyboardOffset,
    ...rest
  } = props;
  const refLegendList = React.useRef(null);
  const combinedRef = useCombinedRef(forwardedRef, refLegendList);
  const blankSpace = reactNativeReanimated.useSharedValue(0);
  React.useEffect(() => {
    if (!anchoredEndSpace) {
      blankSpace.value = 0;
    }
  }, [anchoredEndSpace, blankSpace]);
  const anchoredEndSpaceWithBlankSpace = React.useMemo(() => {
    if (!anchoredEndSpace) {
      return void 0;
    }
    return {
      ...anchoredEndSpace,
      onSizeChanged: (size) => {
        var _a;
        blankSpace.value = size;
        (_a = anchoredEndSpace.onSizeChanged) == null ? void 0 : _a.call(anchoredEndSpace, size);
      }
    };
  }, [anchoredEndSpace, blankSpace]);
  const onContentInsetChange = React.useCallback((insets) => {
    var _a;
    (_a = refLegendList.current) == null ? void 0 : _a.reportContentInset(insets);
  }, []);
  const memoList = React.useCallback(
    (scrollProps) => {
      return /* @__PURE__ */ React__namespace.createElement(
        reactNativeKeyboardController.KeyboardChatScrollView,
        {
          ...scrollProps,
          applyWorkaroundForContentInsetHitTestBug,
          blankSpace,
          extraContentPadding: contentInsetEndAdjustment,
          freeze,
          keyboardLiftBehavior,
          offset: keyboardOffset,
          onContentInsetChange
        }
      );
    },
    [
      applyWorkaroundForContentInsetHitTestBug,
      blankSpace,
      contentInsetEndAdjustment,
      freeze,
      keyboardLiftBehavior,
      keyboardOffset,
      onContentInsetChange
    ]
  );
  const AnimatedLegendListInternal = reanimated.AnimatedLegendList;
  return /* @__PURE__ */ React__namespace.createElement(
    AnimatedLegendListInternal,
    {
      anchoredEndSpace: anchoredEndSpaceWithBlankSpace,
      anchoredEndSpaceOwnerInternal: "scroll",
      ref: combinedRef,
      renderScrollComponent: memoList,
      ...rest
    }
  );
});

exports.KeyboardAwareLegendList = KeyboardAwareLegendList;
exports.useKeyboardChatComposerInset = useKeyboardChatComposerInset;
exports.useKeyboardScrollToEnd = useKeyboardScrollToEnd;
