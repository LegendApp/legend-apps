import * as React from 'react';
import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { StyleSheet, Platform } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useAnimatedRef, useSharedValue, isWorkletFunction, useAnimatedScrollHandler, runOnJS, useComposedEventHandler, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import { internal } from '@legendapp/list/react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';

// src/integrations/keyboard-legacy.tsx
var { typedForwardRef, useCombinedRef } = internal;
var clampProgress = (progress) => {
  "worklet";
  return Math.min(1, Math.max(0, progress));
};
var calculateKeyboardInset = (height, safeAreaInsetBottom) => {
  "worklet";
  return Math.max(0, height - safeAreaInsetBottom);
};
var calculateEffectiveKeyboardHeight = (keyboardHeight, contentLength, scrollLength, alignItemsAtEnd) => {
  "worklet";
  if (alignItemsAtEnd) {
    return keyboardHeight;
  } else {
    const availableSpace = Math.max(0, scrollLength - contentLength);
    return Math.max(0, keyboardHeight - availableSpace);
  }
};
var calculateKeyboardTargetOffset = (startOffset, keyboardHeight, isOpening, progress) => {
  "worklet";
  const normalizedProgress = isOpening ? progress : 1 - progress;
  const delta = (isOpening ? keyboardHeight : -keyboardHeight) * normalizedProgress;
  return Math.max(0, startOffset + delta);
};
var KeyboardAvoidingLegendList = typedForwardRef(function KeyboardAvoidingLegendList2(props, forwardedRef) {
  const {
    contentContainerStyle: contentContainerStyleProp,
    contentInset: contentInsetProp,
    horizontal,
    onMetricsChange: onMetricsChangeProp,
    onContentSizeChange: onContentSizeChangeProp,
    onLayout: onLayoutProp,
    onScroll: onScrollProp,
    safeAreaInsetBottom = 0,
    style: styleProp,
    ...rest
  } = props;
  const { alignItemsAtEnd } = props;
  const styleFlattened = StyleSheet.flatten(styleProp);
  const refLegendList = useRef(null);
  const combinedRef = useCombinedRef(forwardedRef, refLegendList);
  const isIos = Platform.OS === "ios";
  const isAndroid = Platform.OS === "android";
  const scrollViewRef = useAnimatedRef();
  const scrollOffsetY = useSharedValue(0);
  const animatedOffsetY = useSharedValue(null);
  const scrollOffsetAtKeyboardStart = useSharedValue(0);
  const animationMode = useSharedValue("idle");
  const keyboardInset = useSharedValue(0);
  const keyboardHeight = useSharedValue(0);
  const contentLength = useSharedValue(0);
  const scrollLength = useSharedValue(0);
  const isOpening = useSharedValue(false);
  const didInteractive = useSharedValue(false);
  const shouldUpdateAlignItemsAtEndMinSize = useSharedValue(false);
  const isKeyboardOpen = useSharedValue(false);
  const hasSeenKeyboardTransition = useSharedValue(false);
  const skipKeyboardAnimationForCurrentTransition = useSharedValue(false);
  const keyboardInsetRef = useRef(0);
  const [alignItemsAtEndMinSize, setAlignItemsAtEndMinSize] = useState(void 0);
  const onScrollValue = onScrollProp;
  const onScrollCallback = typeof onScrollValue === "function" ? onScrollValue : void 0;
  const onScrollProcessed = onScrollValue && typeof onScrollValue === "object" && "workletEventHandler" in onScrollValue ? onScrollValue : null;
  const onScrollCallbackIsWorklet = useMemo(
    () => onScrollCallback ? isWorkletFunction(onScrollCallback) : false,
    [onScrollCallback]
  );
  const handleContentSizeChange = useCallback(
    (width, height) => {
      const nextContentLength = horizontal ? width : height;
      if (Number.isFinite(nextContentLength) && nextContentLength > 0) {
        contentLength.set(nextContentLength);
      }
      onContentSizeChangeProp == null ? void 0 : onContentSizeChangeProp(width, height);
    },
    [contentLength, horizontal, onContentSizeChangeProp]
  );
  const handleLayout = useCallback(
    (event) => {
      const nextScrollLength = event.nativeEvent.layout[horizontal ? "width" : "height"];
      if (Number.isFinite(nextScrollLength) && nextScrollLength > 0) {
        scrollLength.set(nextScrollLength);
      }
      onLayoutProp == null ? void 0 : onLayoutProp(event);
    },
    [horizontal, onLayoutProp, scrollLength]
  );
  const scrollHandler = useAnimatedScrollHandler(
    (event) => {
      if (animationMode.get() !== "running" || didInteractive.get()) {
        scrollOffsetY.set(event.contentOffset[horizontal ? "x" : "y"]);
      }
      if (onScrollCallback) {
        if (onScrollCallbackIsWorklet) {
          onScrollCallback(event);
        } else {
          runOnJS(onScrollCallback)(event);
        }
      }
    },
    [horizontal, onScrollCallback, onScrollCallbackIsWorklet]
  );
  const composedScrollHandler = useComposedEventHandler([
    scrollHandler,
    onScrollProcessed
  ]);
  const finalScrollHandler = onScrollProcessed ? composedScrollHandler : scrollHandler;
  const setScrollProcessingEnabled = useCallback(
    (enabled) => {
      var _a;
      return (_a = refLegendList.current) == null ? void 0 : _a.setScrollProcessingEnabled(enabled);
    },
    [refLegendList]
  );
  const reportContentInset = useCallback(
    (bottom) => {
      var _a;
      return (_a = refLegendList.current) == null ? void 0 : _a.reportContentInset({ bottom });
    },
    [refLegendList]
  );
  const clearAlignItemsAtEndMinSize = useCallback(() => {
    setAlignItemsAtEndMinSize((prev) => prev === void 0 ? prev : void 0);
  }, []);
  const updateAlignItemsAtEndMinSize = useCallback(
    (nextKeyboardInset) => {
      var _a;
      if (isAndroid) {
        return;
      }
      if (nextKeyboardInset !== void 0) {
        keyboardInsetRef.current = nextKeyboardInset;
      }
      if (!alignItemsAtEnd || horizontal) {
        clearAlignItemsAtEndMinSize();
        return;
      }
      const state = (_a = refLegendList.current) == null ? void 0 : _a.getState();
      if (!state) {
        return;
      }
      const currentInset = keyboardInsetRef.current;
      if (currentInset <= 0) {
        clearAlignItemsAtEndMinSize();
        return;
      }
      if (state.scrollLength <= 0) {
        return;
      }
      const nextMinSize = Math.max(0, state.scrollLength - currentInset);
      setAlignItemsAtEndMinSize((prev) => prev === nextMinSize ? prev : nextMinSize);
    },
    [alignItemsAtEnd, clearAlignItemsAtEndMinSize, horizontal, isAndroid]
  );
  const updateScrollMetrics = useCallback(() => {
    var _a;
    const state = (_a = refLegendList.current) == null ? void 0 : _a.getState();
    if (!state) {
      return;
    }
    contentLength.set(state.contentLength);
    if (animationMode.get() !== "running") {
      scrollOffsetY.set(state.scroll);
    }
    scrollLength.set(state.scrollLength);
    updateAlignItemsAtEndMinSize();
  }, [animationMode, contentLength, scrollLength, scrollOffsetY, updateAlignItemsAtEndMinSize]);
  const handleMetricsChange = useCallback(
    (metrics) => {
      updateScrollMetrics();
      onMetricsChangeProp == null ? void 0 : onMetricsChangeProp(metrics);
    },
    [onMetricsChangeProp, updateScrollMetrics]
  );
  useEffect(() => {
    updateScrollMetrics();
  }, [updateScrollMetrics]);
  useEffect(() => {
    updateAlignItemsAtEndMinSize();
  }, [updateAlignItemsAtEndMinSize]);
  const getEffectiveKeyboardHeightFromInset = useCallback(
    (nextKeyboardInset) => {
      "worklet";
      return calculateEffectiveKeyboardHeight(
        nextKeyboardInset,
        contentLength.get(),
        scrollLength.get(),
        alignItemsAtEnd
      );
    },
    [alignItemsAtEnd, contentLength, scrollLength]
  );
  const getEffectiveKeyboardHeightFromEvent = useCallback(
    (eventHeight) => {
      "worklet";
      const nextKeyboardInset = calculateKeyboardInset(eventHeight, safeAreaInsetBottom);
      return getEffectiveKeyboardHeightFromInset(nextKeyboardInset);
    },
    [getEffectiveKeyboardHeightFromInset, safeAreaInsetBottom]
  );
  useKeyboardHandler(
    // biome-ignore assist/source/useSortedKeys: prefer start/move/end
    {
      onStart: (event) => {
        "worklet";
        const progress = clampProgress(event.progress);
        const shouldSkipInitialCloseAnimation = !hasSeenKeyboardTransition.get() && !isKeyboardOpen.get() && keyboardHeight.get() <= 0 && progress <= 0 && event.height <= 0;
        skipKeyboardAnimationForCurrentTransition.set(shouldSkipInitialCloseAnimation);
        hasSeenKeyboardTransition.set(true);
        if (isKeyboardOpen.get() && progress >= 1 && event.height > 0) {
          didInteractive.set(false);
          animationMode.set("idle");
          runOnJS(setScrollProcessingEnabled)(true);
          return;
        }
        if (shouldSkipInitialCloseAnimation) {
          isOpening.set(false);
          return;
        }
        animationMode.set("running");
        if (!didInteractive.get()) {
          if (event.height > 0) {
            keyboardHeight.set(calculateKeyboardInset(event.height, safeAreaInsetBottom));
          }
          const vIsOpening = progress > 0;
          isOpening.set(vIsOpening);
          shouldUpdateAlignItemsAtEndMinSize.set(
            !!alignItemsAtEnd && !horizontal && contentLength.get() < scrollLength.get()
          );
          if (!shouldUpdateAlignItemsAtEndMinSize.get()) {
            runOnJS(clearAlignItemsAtEndMinSize)();
          }
          const vScrollOffset = scrollOffsetY.get();
          scrollOffsetAtKeyboardStart.set(vScrollOffset);
          if (isIos) {
            const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromInset(keyboardHeight.get());
            const targetOffset = Math.max(
              0,
              vIsOpening ? vScrollOffset + vEffectiveKeyboardHeight : vScrollOffset - vEffectiveKeyboardHeight
            );
            scrollOffsetY.set(targetOffset);
            animatedOffsetY.set(targetOffset);
            keyboardInset.set(vEffectiveKeyboardHeight);
            runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);
          } else if (isAndroid) {
            animatedOffsetY.set(vScrollOffset);
          }
          runOnJS(setScrollProcessingEnabled)(false);
        }
      },
      onInteractive: (event) => {
        "worklet";
        if (animationMode.get() !== "running") {
          runOnJS(setScrollProcessingEnabled)(false);
        }
        animationMode.set("running");
        if (!didInteractive.get()) {
          didInteractive.set(true);
        }
        if (isAndroid && !horizontal) {
          const newInset = calculateKeyboardInset(event.height, safeAreaInsetBottom);
          keyboardInset.set(newInset);
        }
        if (shouldUpdateAlignItemsAtEndMinSize.get() && !horizontal && alignItemsAtEnd) {
          const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromEvent(event.height);
          runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);
        }
      },
      onMove: (event) => {
        "worklet";
        const vIsOpening = isOpening.get();
        const progress = clampProgress(event.progress);
        const skipKeyboardAnimation = skipKeyboardAnimationForCurrentTransition.get();
        if (skipKeyboardAnimation) {
          return;
        }
        if (isAndroid) {
          if (!didInteractive.get()) {
            const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromInset(keyboardHeight.get());
            const targetOffset = calculateKeyboardTargetOffset(
              scrollOffsetAtKeyboardStart.get(),
              vEffectiveKeyboardHeight,
              vIsOpening,
              progress
            );
            scrollOffsetY.set(targetOffset);
            animatedOffsetY.set(targetOffset);
          }
          if (!horizontal) {
            const newInset = calculateKeyboardInset(event.height, safeAreaInsetBottom);
            keyboardInset.set(newInset);
          }
        }
        if (!horizontal && alignItemsAtEnd && !vIsOpening && shouldUpdateAlignItemsAtEndMinSize.get()) {
          const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromEvent(event.height);
          runOnJS(updateAlignItemsAtEndMinSize)(vEffectiveKeyboardHeight);
        }
      },
      onEnd: (event) => {
        "worklet";
        const wasInteractive = didInteractive.get();
        const skipKeyboardAnimation = skipKeyboardAnimationForCurrentTransition.get();
        const vMode = animationMode.get();
        animationMode.set("idle");
        if (skipKeyboardAnimation) {
          skipKeyboardAnimationForCurrentTransition.set(false);
          didInteractive.set(false);
          isOpening.set(false);
          isKeyboardOpen.set(false);
          keyboardHeight.set(0);
          if (!horizontal) {
            keyboardInset.set(0);
            runOnJS(reportContentInset)(0);
            runOnJS(updateAlignItemsAtEndMinSize)(0);
          }
          return;
        }
        if (vMode === "running") {
          const progress = clampProgress(event.progress);
          const vEffectiveKeyboardHeight = getEffectiveKeyboardHeightFromInset(keyboardHeight.get());
          const vIsOpening = isOpening.get();
          if (!wasInteractive) {
            const targetOffset = calculateKeyboardTargetOffset(
              scrollOffsetAtKeyboardStart.get(),
              vEffectiveKeyboardHeight,
              vIsOpening,
              progress
            );
            scrollOffsetY.set(targetOffset);
            animatedOffsetY.set(targetOffset);
          }
          runOnJS(setScrollProcessingEnabled)(true);
          didInteractive.set(false);
          isKeyboardOpen.set(event.height > 0);
          if (event.height > 0) {
            keyboardHeight.set(calculateKeyboardInset(event.height, safeAreaInsetBottom));
          }
          if (!horizontal) {
            const newInset = calculateKeyboardInset(event.height, safeAreaInsetBottom);
            keyboardInset.set(newInset);
            runOnJS(reportContentInset)(newInset);
            if (!vIsOpening) {
              runOnJS(updateAlignItemsAtEndMinSize)(newInset);
            }
            if (newInset <= 0) {
              animatedOffsetY.set(scrollOffsetY.get());
            }
          }
        }
      }
    },
    [
      alignItemsAtEnd,
      clearAlignItemsAtEndMinSize,
      getEffectiveKeyboardHeightFromEvent,
      getEffectiveKeyboardHeightFromInset,
      horizontal,
      isAndroid,
      isIos,
      reportContentInset,
      safeAreaInsetBottom,
      setScrollProcessingEnabled,
      updateAlignItemsAtEndMinSize
    ]
  );
  const animatedProps = useAnimatedProps(() => {
    "worklet";
    var _a, _b, _c, _d;
    const vAnimatedOffsetY = animatedOffsetY.get();
    const baseProps = {
      contentOffset: vAnimatedOffsetY === null ? void 0 : {
        x: 0,
        y: vAnimatedOffsetY
      }
    };
    if (isIos) {
      const keyboardInsetBottom = keyboardInset.get();
      const contentInset = {
        bottom: ((_a = contentInsetProp == null ? void 0 : contentInsetProp.bottom) != null ? _a : 0) + (horizontal ? 0 : keyboardInsetBottom),
        left: (_b = contentInsetProp == null ? void 0 : contentInsetProp.left) != null ? _b : 0,
        right: (_c = contentInsetProp == null ? void 0 : contentInsetProp.right) != null ? _c : 0,
        top: (_d = contentInsetProp == null ? void 0 : contentInsetProp.top) != null ? _d : 0
      };
      return Object.assign(baseProps, {
        contentInset
      });
    } else {
      return baseProps;
    }
  });
  const androidAnimatedStyle = useAnimatedStyle(
    () => ({
      ...styleFlattened || {},
      marginBottom: keyboardInset.get()
    }),
    [styleProp, keyboardInset]
  );
  const style = isAndroid ? androidAnimatedStyle : styleProp;
  const contentContainerStyle = useMemo(() => {
    if (alignItemsAtEndMinSize === void 0) {
      return contentContainerStyleProp;
    }
    const minSizeStyle = horizontal ? { minWidth: alignItemsAtEndMinSize } : { minHeight: alignItemsAtEndMinSize };
    return contentContainerStyleProp ? [contentContainerStyleProp, minSizeStyle] : minSizeStyle;
  }, [alignItemsAtEndMinSize, contentContainerStyleProp, horizontal]);
  return /* @__PURE__ */ React.createElement(
    AnimatedLegendList,
    {
      ...rest,
      animatedProps,
      automaticallyAdjustContentInsets: false,
      contentContainerStyle,
      keyboardDismissMode: "interactive",
      onContentSizeChange: handleContentSizeChange,
      onLayout: handleLayout,
      onMetricsChange: handleMetricsChange,
      onScroll: finalScrollHandler,
      ref: combinedRef,
      refScrollView: scrollViewRef,
      scrollIndicatorInsets: { bottom: 0, top: 0 },
      style
    }
  );
});

export { KeyboardAvoidingLegendList };
