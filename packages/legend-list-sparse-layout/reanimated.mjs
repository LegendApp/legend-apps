import * as React from 'react';
import { useCallback } from 'react';
import { View } from 'react-native';
import Reanimated, { useAnimatedRef, useAnimatedStyle, useSharedValue, useScrollViewOffset } from 'react-native-reanimated';
import { internal, LegendList } from '@legendapp/list/react-native';

// src/integrations/reanimated.tsx
var {
  POSITION_OUT_OF_VIEW,
  IsNewArchitecture,
  getStickyPushLimit,
  typedMemo,
  useArr$,
  useCombinedRef,
  useLatestRef,
  useStableRenderComponent,
  getComponent
} = internal;
var { peek$, useStateContext } = internal;
var ReanimatedScrollOffsetTracker = ({
  animatedScrollRef,
  scrollOffset
}) => {
  useScrollViewOffset(animatedScrollRef, scrollOffset);
  return null;
};
var ReanimatedScrollBridge = typedMemo(function ReanimatedScrollBridgeComponent({
  forwardedRef,
  scrollOffset,
  renderScrollComponent,
  ...props
}) {
  const animatedScrollRef = useAnimatedRef();
  const combinedRef = useCombinedRef(animatedScrollRef, forwardedRef);
  const CustomScrollComponent = useStableRenderComponent(renderScrollComponent, (scrollViewProps, ref) => ({
    ...scrollViewProps,
    ref,
    scrollEventThrottle: 1
  }));
  const ScrollComponent = renderScrollComponent ? CustomScrollComponent : Reanimated.ScrollView;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, scrollOffset && /* @__PURE__ */ React.createElement(ReanimatedScrollOffsetTracker, { animatedScrollRef, scrollOffset }), /* @__PURE__ */ React.createElement(ScrollComponent, { ...props, ref: combinedRef }));
});
var StickyOverlay = typedMemo(function StickyOverlayComponent({ stickyHeaderConfig }) {
  if (!(stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.backdropComponent)) {
    return null;
  }
  return /* @__PURE__ */ React.createElement(
    View,
    {
      style: {
        inset: 0,
        pointerEvents: "none",
        position: "absolute"
      }
    },
    getComponent(stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.backdropComponent)
  );
});
var ReanimatedPositionViewSticky = typedMemo(function ReanimatedPositionViewStickyComponent(props) {
  var _a;
  const ctx = useStateContext();
  const { id, horizontal, style, refView, stickyScrollOffset, stickyHeaderConfig, children, ...rest } = props;
  const [position = POSITION_OUT_OF_VIEW, headerSize = 0, stylePaddingTop = 0, itemKey, itemIndex, _totalSize = 0] = useArr$([
    `containerPosition${id}`,
    "headerSize",
    "stylePaddingTop",
    `containerItemKey${id}`,
    `containerItemIndex${id}`,
    "totalSize"
  ]);
  const pushLimit = React.useMemo(
    () => getStickyPushLimit(ctx, itemIndex, itemKey),
    [ctx, itemIndex, itemKey, _totalSize]
  );
  const stickyOffset = (_a = stickyHeaderConfig == null ? void 0 : stickyHeaderConfig.offset) != null ? _a : 0;
  const stickyStart = position + headerSize + stylePaddingTop - stickyOffset;
  const stickyPositionStyle = useAnimatedStyle(() => {
    const delta = Math.max(0, stickyScrollOffset.value - stickyStart);
    const stickyPosition = position + delta;
    const resolvedPosition = pushLimit !== void 0 ? Math.min(stickyPosition, pushLimit) : stickyPosition;
    return horizontal ? { transform: [{ translateX: resolvedPosition }] } : { transform: [{ translateY: resolvedPosition }] };
  }, [horizontal, position, pushLimit, stickyStart]);
  const viewStyle = React.useMemo(
    () => [style, { zIndex: itemIndex + 1e3 }, stickyPositionStyle],
    [itemIndex, stickyPositionStyle, style]
  );
  return /* @__PURE__ */ React.createElement(Reanimated.View, { ref: refView, style: viewStyle, ...rest }, /* @__PURE__ */ React.createElement(StickyOverlay, { stickyHeaderConfig }), children);
});
var ReanimatedPositionView = typedMemo(function ReanimatedPositionViewComponent(props) {
  const ctx = useStateContext();
  const { id, horizontal, style, refView, children, recycleItems, layoutTransition, ...rest } = props;
  const [positionValue = POSITION_OUT_OF_VIEW] = useArr$([`containerPosition${id}`]);
  const prevItemKeyRef = React.useRef(void 0);
  let shouldSkipTransitionForRecycleReuse = false;
  if (recycleItems && layoutTransition) {
    const itemKeySignal = `containerItemKey${id}`;
    const itemKey = peek$(ctx, itemKeySignal);
    shouldSkipTransitionForRecycleReuse = itemKey !== void 0 && prevItemKeyRef.current !== void 0 && prevItemKeyRef.current !== itemKey;
    if (itemKey !== void 0) {
      prevItemKeyRef.current = itemKey;
    }
  } else {
    prevItemKeyRef.current = void 0;
  }
  const viewStyle = React.useMemo(
    () => [style, horizontal ? { left: positionValue } : { top: positionValue }],
    [horizontal, positionValue, style]
  );
  return /* @__PURE__ */ React.createElement(
    Reanimated.View,
    {
      layout: shouldSkipTransitionForRecycleReuse ? void 0 : layoutTransition,
      ref: refView,
      style: viewStyle,
      ...rest
    },
    children
  );
});
function setSharedValueValue(sharedValue, value) {
  if (!sharedValue) {
    return;
  }
  const sharedValueWithMethods = sharedValue;
  if (typeof sharedValueWithMethods.set === "function") {
    sharedValueWithMethods.set(value);
  } else {
    sharedValueWithMethods.value = value;
  }
}
function useAnimatedLegendListSharedValuesSync(legendList, sharedValues) {
  React.useEffect(() => {
    if (!legendList || !sharedValues) {
      return;
    }
    const state = legendList.getState();
    setSharedValueValue(sharedValues.activeStickyIndex, state.activeStickyIndex);
    setSharedValueValue(sharedValues.isAtEnd, state.isAtEnd);
    setSharedValueValue(sharedValues.isAtStart, state.isAtStart);
    setSharedValueValue(sharedValues.isNearEnd, state.isNearEnd);
    setSharedValueValue(sharedValues.isNearStart, state.isNearStart);
    setSharedValueValue(
      sharedValues.isWithinMaintainScrollAtEndThreshold,
      state.isWithinMaintainScrollAtEndThreshold
    );
    setSharedValueValue(sharedValues.scrollOffset, state.scroll);
    const unsubscribers = [
      sharedValues.activeStickyIndex ? state.listen(
        "activeStickyIndex",
        (value) => setSharedValueValue(sharedValues.activeStickyIndex, value)
      ) : void 0,
      sharedValues.isAtEnd ? state.listen("isAtEnd", (value) => setSharedValueValue(sharedValues.isAtEnd, value)) : void 0,
      sharedValues.isAtStart ? state.listen("isAtStart", (value) => setSharedValueValue(sharedValues.isAtStart, value)) : void 0,
      sharedValues.isNearEnd ? state.listen("isNearEnd", (value) => setSharedValueValue(sharedValues.isNearEnd, value)) : void 0,
      sharedValues.isNearStart ? state.listen("isNearStart", (value) => setSharedValueValue(sharedValues.isNearStart, value)) : void 0,
      sharedValues.isWithinMaintainScrollAtEndThreshold ? state.listen(
        "isWithinMaintainScrollAtEndThreshold",
        (value) => setSharedValueValue(sharedValues.isWithinMaintainScrollAtEndThreshold, value)
      ) : void 0
    ];
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe == null ? void 0 : unsubscribe();
      }
    };
  }, [legendList, sharedValues]);
}
var LegendListForwardedRef = typedMemo(
  // biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
  React.forwardRef(function LegendListForwardedRef2(props, ref) {
    var _a, _b;
    const { itemLayoutAnimation, recycleItems, refLegendList, renderScrollComponent, sharedValues, ...rest } = props;
    const refFn = useCallback(
      (r) => {
        refLegendList(r);
      },
      [refLegendList]
    );
    const internalScrollOffset = useSharedValue(0);
    const scrollOffset = (_a = sharedValues == null ? void 0 : sharedValues.scrollOffset) != null ? _a : internalScrollOffset;
    const trackedScrollOffset = (sharedValues == null ? void 0 : sharedValues.scrollOffset) !== void 0 || ((_b = rest.stickyHeaderIndices) == null ? void 0 : _b.length) ? scrollOffset : void 0;
    const renderScrollComponentForBridge = React.useMemo(
      () => renderScrollComponent ? (scrollViewProps) => renderScrollComponent(scrollViewProps) : void 0,
      [renderScrollComponent]
    );
    const renderReanimatedScrollComponent = useCallback(
      (scrollViewProps) => {
        const { ref: forwardedRef, ...restScrollViewProps } = scrollViewProps;
        return /* @__PURE__ */ React.createElement(
          ReanimatedScrollBridge,
          {
            ...restScrollViewProps,
            forwardedRef,
            renderScrollComponent: renderScrollComponentForBridge,
            scrollOffset: trackedScrollOffset
          }
        );
      },
      [renderScrollComponentForBridge, trackedScrollOffset]
    );
    const stickyPositionComponentInternal = React.useMemo(
      () => function StickyPositionComponent(stickyProps) {
        return /* @__PURE__ */ React.createElement(ReanimatedPositionViewSticky, { ...stickyProps, stickyScrollOffset: scrollOffset });
      },
      [scrollOffset]
    );
    const itemLayoutAnimationRef = useLatestRef(itemLayoutAnimation);
    const hasItemLayoutAnimation = !!itemLayoutAnimation;
    const positionComponentInternal = React.useMemo(() => {
      if (!hasItemLayoutAnimation) {
        return void 0;
      }
      return function PositionComponent(positionProps) {
        return /* @__PURE__ */ React.createElement(
          ReanimatedPositionView,
          {
            ...positionProps,
            layoutTransition: itemLayoutAnimationRef.current,
            recycleItems
          }
        );
      };
    }, [hasItemLayoutAnimation, recycleItems]);
    const legendListProps = {
      ...rest,
      positionComponentInternal,
      recycleItems,
      ...{
        renderScrollComponent: renderReanimatedScrollComponent,
        ...IsNewArchitecture ? { stickyPositionComponentInternal } : {}
      }
    };
    return /* @__PURE__ */ React.createElement(LegendList, { ref: refFn, refScrollView: ref, ...legendListProps });
  })
);
var AnimatedLegendListComponent = Reanimated.createAnimatedComponent(LegendListForwardedRef);
var AnimatedLegendListComponentTyped = AnimatedLegendListComponent;
var AnimatedLegendList = typedMemo(
  // biome-ignore lint/nursery/noShadow: const function name shadowing is intentional
  React.forwardRef(function AnimatedLegendList2(props, ref) {
    const { refScrollView, ...rest } = props;
    const { animatedProps, sharedValues } = props;
    const [legendList, setLegendList] = React.useState(null);
    const combinedRef = useCombinedRef(
      React.useCallback((instance) => {
        setLegendList((prev) => prev === instance ? prev : instance);
      }, []),
      ref
    );
    useAnimatedLegendListSharedValuesSync(legendList, sharedValues);
    const forwardedProps = {
      ...rest,
      animatedPropsInternal: animatedProps,
      refLegendList: combinedRef
    };
    return /* @__PURE__ */ React.createElement(AnimatedLegendListComponentTyped, { ...forwardedProps, ref: refScrollView });
  })
);

export { AnimatedLegendList };
