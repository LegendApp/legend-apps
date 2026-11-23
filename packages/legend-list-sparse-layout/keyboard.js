/* sparse-k14-390r-32c462af */
'use strict';

var React = require('react');
var reactNative$1 = require('react-native');
var reactNativeKeyboardController = require('react-native-keyboard-controller');
var Reanimated = require('react-native-reanimated');
var reactNative = require('@legendapp/list/react-native');
var reanimated = require('@legendapp/list/reanimated');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

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
var Reanimated__default = /*#__PURE__*/_interopDefault(Reanimated);

// src/integrations/keyboard.tsx
var { typedForwardRef, useCombinedRef } = reactNative.internal;
function setOnUI(sharedValue, value) {
  Reanimated.runOnUI((next) => {
    "worklet";
    sharedValue.value = next;
  })(value);
}
var HoldContentShrinkContext = React.createContext(false);
function ReanimatedContentExtent({
  children,
  committedSize,
  contentAlignItems,
  contentRowGap = 0,
  footer
}) {
  const holdShrink = React.useContext(HoldContentShrinkContext);
  const extent = Reanimated.useSharedValue(committedSize);
  React.useLayoutEffect(() => {
    if (!holdShrink) {
      return;
    }
    if (reactNative$1.Platform.OS === "ios") {
      Reanimated.runOnUI((next) => {
        "worklet";
        requestAnimationFrame(() => {
          extent.value = next;
        });
      })(committedSize);
    } else {
      setOnUI(extent, committedSize);
    }
  }, [extent, holdShrink, committedSize]);
  const style = Reanimated.useAnimatedStyle(() => ({ minHeight: holdShrink ? extent.value : 0 }), [holdShrink]);
  const wrapperStyle = React.useMemo(
    () => contentRowGap || contentAlignItems ? [{ alignItems: contentAlignItems, rowGap: contentRowGap }, style] : style,
    [contentAlignItems, contentRowGap, style]
  );
  if (footer) {
    return /* @__PURE__ */ React__namespace.createElement(Reanimated__default.default.View, { style: wrapperStyle }, children, footer);
  }
  return /* @__PURE__ */ React__namespace.createElement(React__namespace.Fragment, null, children && /* @__PURE__ */ React__namespace.createElement(Reanimated__default.default.View, { style }, children), footer);
}
if (typeof __DEV__ !== "undefined" && __DEV__ && !reactNativeKeyboardController.KeyboardChatScrollView) {
  console.warn(
    "[legend-list] KeyboardAwareLegendList requires a recent react-native-keyboard-controller with KeyboardChatScrollView. Please upgrade react-native-keyboard-controller to at least 1.21.7."
  );
}
function useKeyboardChatComposerInset(_listRef, composerRef, initialHeight = 0) {
  const contentInsetEndAdjustment = Reanimated.useSharedValue(initialHeight);
  const lastHeightRef = React.useRef(void 0);
  const reportHeight = React.useCallback(
    (height) => {
      if (Number.isFinite(height) && height !== lastHeightRef.current) {
        lastHeightRef.current = height;
        contentInsetEndAdjustment.value = height;
      }
    },
    [contentInsetEndAdjustment]
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
var DISMISS_TIMEOUT_MS = 2e3;
function dismissKeyboard() {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, DISMISS_TIMEOUT_MS);
  });
  return Promise.race([reactNativeKeyboardController.KeyboardController.dismiss(), timeout]).catch(() => {
  }).finally(() => clearTimeout(timer));
}
var endScrollFreezes = /* @__PURE__ */ new WeakMap();
var keyboardCloses = /* @__PURE__ */ new WeakMap();
function getEndScrollFreeze(freeze) {
  let owned = endScrollFreezes.get(freeze);
  if (!owned) {
    owned = Reanimated.makeMutable(false);
    endScrollFreezes.set(freeze, owned);
  }
  return owned;
}
function setFreeze(freeze, value, onSet, animated = false) {
  const owned = getEndScrollFreeze(freeze);
  Reanimated.runOnUI(() => {
    "worklet";
    owned.value = value ? animated ? "animated" : "immediate" : false;
    freeze.value = value;
    if (onSet) Reanimated.runOnJS(onSet)();
  })();
}
function useKeyboardScrollToEnd({ freeze: freezeProp, listRef }) {
  const internalFreeze = Reanimated.useSharedValue(false);
  const freeze = freezeProp != null ? freezeProp : internalFreeze;
  const latestRequest = React.useRef(0);
  const closing = React.useRef(void 0);
  const preparedClose = React.useRef(false);
  const scrollMessageToEnd = React.useCallback(
    async ({ animated, closeKeyboard }) => {
      var _a;
      const list = listRef.current;
      if (!list) return;
      if (closeKeyboard && ((_a = keyboardCloses.get(freeze)) == null ? void 0 : _a.prepare())) preparedClose.current = true;
      const scrollPromise = list.scrollToEnd({ animated });
      const request = ++latestRequest.current;
      const frozen = new Promise((resolve) => setFreeze(freeze, true, resolve, preparedClose.current));
      if (closeKeyboard && !closing.current) {
        closing.current = frozen.then(dismissKeyboard).finally(() => {
          closing.current = void 0;
        });
      }
      await Promise.all([scrollPromise, closing.current]).finally(() => {
        var _a2;
        if (request === latestRequest.current) {
          preparedClose.current = false;
          setFreeze(freeze, false, (_a2 = keyboardCloses.get(freeze)) == null ? void 0 : _a2.restore);
        }
      });
    },
    [freeze, listRef]
  );
  return {
    freeze,
    scrollMessageToEnd
  };
}
var KeyboardAwareLegendList = typedForwardRef(function KeyboardAwareLegendList2(props, forwardedRef) {
  var _a, _b;
  const {
    anchoredEndSpace,
    applyWorkaroundForContentInsetHitTestBug,
    contentInsetEndAdjustment,
    freeze,
    keyboardLiftBehavior,
    keyboardOffset,
    refScrollView,
    ...rest
  } = props;
  const refLegendList = React.useRef(null);
  const combinedRef = useCombinedRef(forwardedRef, refLegendList);
  const staticContentInsetRef = React.useRef(rest.contentInset);
  staticContentInsetRef.current = rest.contentInset;
  const blankSpace = Reanimated.useSharedValue(0);
  const scrollRef = Reanimated.useAnimatedRef();
  const combinedScrollRef = useCombinedRef(scrollRef, refScrollView);
  const scrollOffset = Reanimated.useScrollViewOffset(scrollRef);
  const dimensions = Reanimated.useSharedValue({ content: 0, viewport: 0 });
  const frozenClose = Reanimated.useSharedValue(false);
  const closeOffset = Reanimated.useSharedValue(0);
  const endScrollFreeze = typeof freeze === "object" ? getEndScrollFreeze(freeze) : void 0;
  const reportedInsets = React.useRef(void 0);
  const initialKeyboardHeight = reactNativeKeyboardController.KeyboardController.state().height;
  const keyboard = Reanimated.useSharedValue({ height: initialKeyboardHeight, progress: initialKeyboardHeight > 0 ? 1 : 0 });
  const keyboardTarget = Reanimated.useSharedValue(initialKeyboardHeight);
  const isHorizontal = !!rest.horizontal;
  const reportViewabilityInset = React.useCallback((inset) => {
    var _a2, _b2;
    (_b2 = (_a2 = refLegendList.current) == null ? void 0 : _a2.reportViewabilityInsetEndInternal) == null ? void 0 : _b2.call(_a2, inset);
  }, []);
  const onKeyboardMove = (event) => {
    "worklet";
    keyboard.value = { height: event.height, progress: event.progress };
  };
  reactNativeKeyboardController.useKeyboardHandler(
    {
      onEnd: onKeyboardMove,
      onInteractive: onKeyboardMove,
      onMove: onKeyboardMove,
      onStart: (event) => {
        "worklet";
        keyboardTarget.value = event.height;
        if (event.height === 0 && !frozenClose.value) closeOffset.value = scrollOffset.value;
        frozenClose.value = event.height === 0 && !!(endScrollFreeze == null ? void 0 : endScrollFreeze.value);
      }
    },
    [endScrollFreeze]
  );
  Reanimated.useAnimatedReaction(
    // Blank space extends the scroll range but does not obscure content.
    () => {
      var _a2;
      return isHorizontal ? 0 : Math.max(0, keyboard.value.height - (keyboardOffset != null ? keyboardOffset : 0) * keyboard.value.progress) + Math.max(0, (_a2 = contentInsetEndAdjustment == null ? void 0 : contentInsetEndAdjustment.value) != null ? _a2 : 0);
    },
    (current, previous) => {
      if (current !== previous) {
        Reanimated.runOnJS(reportViewabilityInset)(current);
      }
    },
    [contentInsetEndAdjustment, isHorizontal, keyboard, keyboardOffset, reportViewabilityInset]
  );
  React.useEffect(() => {
    if (!anchoredEndSpace) {
      setOnUI(blankSpace, 0);
    }
  }, [anchoredEndSpace, blankSpace]);
  const anchoredEndSpaceWithBlankSpace = React.useMemo(() => {
    if (!anchoredEndSpace) {
      return void 0;
    }
    return {
      ...anchoredEndSpace,
      onSizeChanged: (size) => {
        var _a2;
        setOnUI(blankSpace, size);
        (_a2 = anchoredEndSpace.onSizeChanged) == null ? void 0 : _a2.call(anchoredEndSpace, size);
      }
    };
  }, [anchoredEndSpace, blankSpace]);
  const staticBottomInset = reactNative$1.Platform.OS === "ios" ? (_b = (_a = rest.contentInset) == null ? void 0 : _a.bottom) != null ? _b : 0 : 0;
  const getEndInset = React.useCallback(
    (keyboardInset = 0) => {
      "worklet";
      var _a2;
      const padding = keyboardInset + ((_a2 = contentInsetEndAdjustment == null ? void 0 : contentInsetEndAdjustment.value) != null ? _a2 : 0);
      return staticBottomInset + Math.min(dimensions.value.viewport, Math.max(blankSpace.value, padding));
    },
    [blankSpace, contentInsetEndAdjustment, dimensions, staticBottomInset]
  );
  const onContentInsetChange = React.useCallback(
    (insets) => {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i;
      const staticInset = staticContentInsetRef.current;
      if (reactNative$1.Platform.OS !== "ios" && staticInset) {
        insets = {
          bottom: Math.max(0, ((_a2 = insets.bottom) != null ? _a2 : 0) - ((_b2 = staticInset.bottom) != null ? _b2 : 0)),
          left: Math.max(0, ((_c = insets.left) != null ? _c : 0) - ((_d = staticInset.left) != null ? _d : 0)),
          right: Math.max(0, ((_e = insets.right) != null ? _e : 0) - ((_f = staticInset.right) != null ? _f : 0)),
          top: Math.max(0, ((_g = insets.top) != null ? _g : 0) - ((_h = staticInset.top) != null ? _h : 0))
        };
      }
      reportedInsets.current = insets;
      const list = refLegendList.current;
      if ((endScrollFreeze == null ? void 0 : endScrollFreeze.value) === "animated") {
        (_i = list == null ? void 0 : list.reportContentInsetForScrollInternal) == null ? void 0 : _i.call(list, { ...insets, bottom: getEndInset() });
      } else if ((keyboardTarget.value > 0 || keyboard.value.height > 0) && (list == null ? void 0 : list.reportContentInsetForScrollInternal)) {
        list.reportContentInsetForScrollInternal(insets);
      } else {
        list == null ? void 0 : list.reportContentInset(insets);
      }
    },
    [endScrollFreeze, getEndInset, keyboard, keyboardTarget]
  );
  const reportClosingInset = React.useCallback((bottom) => {
    var _a2;
    (_a2 = refLegendList.current) == null ? void 0 : _a2.reportContentInset({ ...reportedInsets.current, bottom });
  }, []);
  React.useLayoutEffect(() => {
    if (typeof freeze !== "object") return;
    keyboardCloses.set(freeze, {
      prepare: () => {
        var _a2;
        const report = (_a2 = refLegendList.current) == null ? void 0 : _a2.reportContentInsetForScrollInternal;
        if (isHorizontal || !dimensions.value.viewport || keyboard.value.height === 0 || !report) return false;
        report({ ...reportedInsets.current, bottom: getEndInset() });
        return true;
      },
      restore: () => {
        var _a2;
        if (keyboard.value.height > 0 && reportedInsets.current) {
          (_a2 = refLegendList.current) == null ? void 0 : _a2.reportContentInset(reportedInsets.current);
        }
      }
    });
    return () => {
      keyboardCloses.delete(freeze);
    };
  }, [dimensions, freeze, getEndInset, isHorizontal, keyboard]);
  Reanimated.useAnimatedReaction(
    () => frozenClose.value && (endScrollFreeze == null ? void 0 : endScrollFreeze.value) === "immediate" && typeof freeze === "object" && freeze.value ? { height: keyboard.value.height, scroll: scrollOffset.value } : null,
    (current, previous) => {
      if (!current) {
        frozenClose.value = false;
        return;
      }
      if (isHorizontal || !dimensions.value.viewport) return;
      closeOffset.value = Math.min(closeOffset.value, current.scroll);
      const keyboardInset = Math.max(0, current.height - (keyboardOffset != null ? keyboardOffset : 0) * keyboard.value.progress);
      const contentEnd = dimensions.value.content - dimensions.value.viewport;
      const keyboardEndInset = getEndInset(keyboardInset);
      const inset = Math.max(getEndInset(), Math.min(keyboardEndInset, closeOffset.value - contentEnd));
      if (current.height === 0 && (previous == null ? void 0 : previous.height) !== 0) Reanimated.runOnJS(reportClosingInset)(getEndInset());
      const end = Math.max(0, contentEnd + inset);
      if (current.scroll > end) Reanimated.scrollTo(scrollRef, 0, end, false);
    },
    [freeze, getEndInset, isHorizontal, keyboardOffset, reportClosingInset]
  );
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
          onContentInsetChange,
          onContentSizeChange: (width, height) => {
            var _a2;
            dimensions.value = { ...dimensions.value, content: height };
            (_a2 = scrollProps.onContentSizeChange) == null ? void 0 : _a2.call(scrollProps, width, height);
          },
          onLayout: (event) => {
            var _a2;
            dimensions.value = { ...dimensions.value, viewport: event.nativeEvent.layout.height };
            (_a2 = scrollProps.onLayout) == null ? void 0 : _a2.call(scrollProps, event);
          }
        }
      );
    },
    [
      applyWorkaroundForContentInsetHitTestBug,
      blankSpace,
      contentInsetEndAdjustment,
      dimensions,
      freeze,
      keyboardLiftBehavior,
      keyboardOffset,
      onContentInsetChange
    ]
  );
  const AnimatedLegendListInternal = reanimated.AnimatedLegendList;
  return /* @__PURE__ */ React__namespace.createElement(HoldContentShrinkContext.Provider, { value: !!anchoredEndSpace }, /* @__PURE__ */ React__namespace.createElement(
    AnimatedLegendListInternal,
    {
      anchoredEndSpace: anchoredEndSpaceWithBlankSpace,
      anchoredEndSpaceOwnerInternal: "scroll",
      contentExtentComponentInternal: ReanimatedContentExtent,
      ref: combinedRef,
      refScrollView: combinedScrollRef,
      renderScrollComponent: memoList,
      ...rest
    }
  ));
});

exports.KeyboardAwareLegendList = KeyboardAwareLegendList;
exports.useKeyboardChatComposerInset = useKeyboardChatComposerInset;
exports.useKeyboardScrollToEnd = useKeyboardScrollToEnd;
