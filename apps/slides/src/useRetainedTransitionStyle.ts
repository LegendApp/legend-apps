import { useLayoutEffect, useRef } from "react";
import type { Animated, ViewStyle } from "react-native";

type TransitionStyle = Animated.WithAnimatedObject<ViewStyle>;

/** Hidden layers retain their last graph: resetting a faded-out layer to one
 * races Fabric's z-index update and can flash the old slide above the new one. */
export function useRetainedTransitionStyle(style: TransitionStyle, preparing: boolean): TransitionStyle {
  const committed = useRef(style);
  useLayoutEffect(() => {
    if (!preparing) committed.current = style;
  }, [preparing, style]);
  return preparing ? committed.current : style;
}
