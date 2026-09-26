import Animated from "react-native-reanimated";
import { useTransitionStyle, type TransitionProgress } from "./transitionValues";
import { navigationExitStyle } from "./navigationExitStyle";
import { createContext, useContext, type ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

/** Supplied by the host transition; slide content never starts an exit clock. */
export const NavigationTransitionContext = createContext<{ progress: TransitionProgress; outgoing: boolean } | null>(null);

export function NavigationExitView({ children, enabled = true, scale = 0.88, style }: {
  children: ReactNode; enabled?: boolean; scale?: number; style?: StyleProp<ViewStyle>;
}) {
  const transition = useContext(NavigationTransitionContext);
  const progress = enabled && transition?.outgoing ? transition.progress : undefined;
  const animatedStyle = useTransitionStyle(progress ? navigationExitStyle(progress, scale) : { opacity: StyleSheet.flatten(style)?.opacity ?? 1, transform: StyleSheet.flatten(style)?.transform ?? [] });
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
