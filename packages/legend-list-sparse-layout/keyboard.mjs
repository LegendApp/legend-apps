/* sparse-k14-390r-32c462af */
import * as React from 'react';
import { createContext, useRef, useCallback, useEffect, useMemo, useLayoutEffect, useContext } from 'react';
import { Platform } from 'react-native';
import { KeyboardChatScrollView, KeyboardController, useKeyboardHandler } from 'react-native-keyboard-controller';
import Reanimated, { useSharedValue, useAnimatedRef, useScrollViewOffset, useAnimatedReaction, runOnJS, scrollTo, makeMutable, runOnUI, useAnimatedStyle } from 'react-native-reanimated';
import { internal } from '@legendapp/list/react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';

// src/integrations/keyboard.tsx
var { typedForwardRef, useCombinedRef } = internal;
function setOnUI(sharedValue, value) {
  runOnUI((next) => {
    "worklet";
    sharedValue.value = next;
  })(value);
}
var HoldContentShrinkContext = createContext(false);
function ReanimatedContentExtent({
  children,
  committedSize,
  contentAlignItems,
  contentRowGap = 0,
  footer
}) {
  const holdShrink = useContext(HoldContentShrinkContext);
  const extent = useSharedValue(committedSize);
  useLayoutEffect(() => {
    if (!holdShrink) {
      return;
    }
    if (Platform.OS === "ios") {
      runOnUI((next) => {
        "worklet";
        requestAnimationFrame(() => {
          extent.value = next;
        });
      })(committedSize);
    } else {
      setOnUI(extent, committedSize);
    }
  }, [extent, holdShrink, committedSize]);
  const style = useAnimatedStyle(() => ({ minHeight: holdShrink ? extent.value : 0 }), [holdShrink]);
  const wrapperStyle = useMemo(
    () => contentRowGap || contentAlignItems ? [{ alignItems: contentAlignItems, rowGap: contentRowGap }, style] : style,
    [contentAlignItems, contentRowGap, style]
  );
  if (footer) {
    return /* @__PURE__ */ React.createElement(Reanimated.View, { style: wrapperStyle }, children, footer);
  }
  return /* @__PURE__ */ React.createElement(React.Fragment, null, children && /* @__PURE__ */ React.createElement(Reanimated.View, { style }, children), footer);
}
if (typeof __DEV__ !== "undefined" && __DEV__ && !KeyboardChatScrollView) {
  console.warn(
    "[legend-list] KeyboardAwareLegendList requires a recent react-native-keyboard-controller with KeyboardChatScrollView. Please upgrade react-native-keyboard-controller to at least 1.21.7."
  );
}
function useKeyboardChatComposerInset(_listRef, composerRef, initialHeight = 0) {
  const contentInsetEndAdjustment = useSharedValue(initialHeight);
  const lastHeightRef = useRef(void 0);
  const reportHeight = useCallback(
    (height) => {
      if (Number.isFinite(height) && height !== lastHeightRef.current) {
        lastHeightRef.current = height;
        contentInsetEndAdjustment.value = height;
      }
    },
    [contentInsetEndAdjustment]
  );
  useLayoutEffect(() => {
    var _a;
    (_a = composerRef.current) == null ? void 0 : _a.measure((_x, _y, _width, height) => {
      reportHeight(height);
    });
  }, [composerRef, reportHeight]);
  const onComposerLayout = useCallback(
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
  return Promise.race([KeyboardController.dismiss(), timeout]).catch(() => {
  }).finally(() => clearTimeout(timer));
}
var endScrollFreezes = /* @__PURE__ */ new WeakMap();
var keyboardCloses = /* @__PURE__ */ new WeakMap();
function getEndScrollFreeze(freeze) {
  let owned = endScrollFreezes.get(freeze);
  if (!owned) {
    owned = makeMutable(false);
    endScrollFreezes.set(freeze, owned);
  }
  return owned;
}
function setFreeze(freeze, value, onSet, animated = false) {
  const owned = getEndScrollFreeze(freeze);
  runOnUI(() => {
    "worklet";
    owned.value = value ? animated ? "animated" : "immediate" : false;
    freeze.value = value;
    if (onSet) runOnJS(onSet)();
  })();
}
function useKeyboardScrollToEnd({ freeze: freezeProp, listRef }) {
  const internalFreeze = useSharedValue(false);
  const freeze = freezeProp != null ? freezeProp : internalFreeze;
  const latestRequest = useRef(0);
  const closing = useRef(void 0);
  const preparedClose = useRef(false);
  const scrollMessageToEnd = useCallback(
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
  const refLegendList = useRef(null);
  const combinedRef = useCombinedRef(forwardedRef, refLegendList);
  const staticContentInsetRef = useRef(rest.contentInset);
  staticContentInsetRef.current = rest.contentInset;
  const blankSpace = useSharedValue(0);
  const scrollRef = useAnimatedRef();
  const combinedScrollRef = useCombinedRef(scrollRef, refScrollView);
  const scrollOffset = useScrollViewOffset(scrollRef);
  const dimensions = useSharedValue({ content: 0, viewport: 0 });
  const frozenClose = useSharedValue(false);
  const closeOffset = useSharedValue(0);
  const endScrollFreeze = typeof freeze === "object" ? getEndScrollFreeze(freeze) : void 0;
  const reportedInsets = useRef(void 0);
  const initialKeyboardHeight = KeyboardController.state().height;
  const keyboard = useSharedValue({ height: initialKeyboardHeight, progress: initialKeyboardHeight > 0 ? 1 : 0 });
  const keyboardTarget = useSharedValue(initialKeyboardHeight);
  const isHorizontal = !!rest.horizontal;
  const reportViewabilityInset = useCallback((inset) => {
    var _a2, _b2;
    (_b2 = (_a2 = refLegendList.current) == null ? void 0 : _a2.reportViewabilityInsetEndInternal) == null ? void 0 : _b2.call(_a2, inset);
  }, []);
  const onKeyboardMove = (event) => {
    "worklet";
    keyboard.value = { height: event.height, progress: event.progress };
  };
  useKeyboardHandler(
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
  useAnimatedReaction(
    // Blank space extends the scroll range but does not obscure content.
    () => {
      var _a2;
      return isHorizontal ? 0 : Math.max(0, keyboard.value.height - (keyboardOffset != null ? keyboardOffset : 0) * keyboard.value.progress) + Math.max(0, (_a2 = contentInsetEndAdjustment == null ? void 0 : contentInsetEndAdjustment.value) != null ? _a2 : 0);
    },
    (current, previous) => {
      if (current !== previous) {
        runOnJS(reportViewabilityInset)(current);
      }
    },
    [contentInsetEndAdjustment, isHorizontal, keyboard, keyboardOffset, reportViewabilityInset]
  );
  useEffect(() => {
    if (!anchoredEndSpace) {
      setOnUI(blankSpace, 0);
    }
  }, [anchoredEndSpace, blankSpace]);
  const anchoredEndSpaceWithBlankSpace = useMemo(() => {
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
  const staticBottomInset = Platform.OS === "ios" ? (_b = (_a = rest.contentInset) == null ? void 0 : _a.bottom) != null ? _b : 0 : 0;
  const getEndInset = useCallback(
    (keyboardInset = 0) => {
      "worklet";
      var _a2;
      const padding = keyboardInset + ((_a2 = contentInsetEndAdjustment == null ? void 0 : contentInsetEndAdjustment.value) != null ? _a2 : 0);
      return staticBottomInset + Math.min(dimensions.value.viewport, Math.max(blankSpace.value, padding));
    },
    [blankSpace, contentInsetEndAdjustment, dimensions, staticBottomInset]
  );
  const onContentInsetChange = useCallback(
    (insets) => {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i;
      const staticInset = staticContentInsetRef.current;
      if (Platform.OS !== "ios" && staticInset) {
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
  const reportClosingInset = useCallback((bottom) => {
    var _a2;
    (_a2 = refLegendList.current) == null ? void 0 : _a2.reportContentInset({ ...reportedInsets.current, bottom });
  }, []);
  useLayoutEffect(() => {
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
  useAnimatedReaction(
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
      if (current.height === 0 && (previous == null ? void 0 : previous.height) !== 0) runOnJS(reportClosingInset)(getEndInset());
      const end = Math.max(0, contentEnd + inset);
      if (current.scroll > end) scrollTo(scrollRef, 0, end, false);
    },
    [freeze, getEndInset, isHorizontal, keyboardOffset, reportClosingInset]
  );
  const memoList = useCallback(
    (scrollProps) => {
      return /* @__PURE__ */ React.createElement(
        KeyboardChatScrollView,
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
  const AnimatedLegendListInternal = AnimatedLegendList;
  return /* @__PURE__ */ React.createElement(HoldContentShrinkContext.Provider, { value: !!anchoredEndSpace }, /* @__PURE__ */ React.createElement(
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

export { KeyboardAwareLegendList, useKeyboardChatComposerInset, useKeyboardScrollToEnd };
