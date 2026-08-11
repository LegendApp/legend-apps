import * as React from 'react';
import { useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { KeyboardChatScrollView, KeyboardController } from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';
import { internal } from '@legendapp/list/react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';

// src/integrations/keyboard.tsx
var { typedForwardRef, useCombinedRef } = internal;
if (typeof __DEV__ !== "undefined" && __DEV__ && !KeyboardChatScrollView) {
  console.warn(
    "[legend-list] KeyboardAwareLegendList requires a recent react-native-keyboard-controller with KeyboardChatScrollView. Please upgrade react-native-keyboard-controller to at least 1.21.7."
  );
}
function useKeyboardChatComposerInset(listRef, composerRef, initialHeight = 0) {
  const contentInsetEndAdjustment = useSharedValue(initialHeight);
  const lastHeightRef = useRef(void 0);
  const reportHeight = useCallback(
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
function useKeyboardScrollToEnd({ freeze: freezeProp, listRef }) {
  const internalFreeze = useSharedValue(false);
  const freeze = freezeProp != null ? freezeProp : internalFreeze;
  const scrollMessageToEnd = useCallback(
    async ({ animated, closeKeyboard }) => {
      const listRefCurrent = listRef.current;
      if (listRefCurrent) {
        freeze.set(true);
        const dismissPromise = closeKeyboard && KeyboardController.dismiss();
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
  const refLegendList = useRef(null);
  const combinedRef = useCombinedRef(forwardedRef, refLegendList);
  const blankSpace = useSharedValue(0);
  useEffect(() => {
    if (!anchoredEndSpace) {
      blankSpace.value = 0;
    }
  }, [anchoredEndSpace, blankSpace]);
  const anchoredEndSpaceWithBlankSpace = useMemo(() => {
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
  const onContentInsetChange = useCallback((insets) => {
    var _a;
    (_a = refLegendList.current) == null ? void 0 : _a.reportContentInset(insets);
  }, []);
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
  const AnimatedLegendListInternal = AnimatedLegendList;
  return /* @__PURE__ */ React.createElement(
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

export { KeyboardAwareLegendList, useKeyboardChatComposerInset, useKeyboardScrollToEnd };
