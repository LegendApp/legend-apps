import { createContext, useContext, type ReactNode } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";

/** Supplied by the host transition; slide content never starts an exit clock. */
export const NavigationTransitionContext = createContext<{ progress: Animated.Value; outgoing: boolean } | null>(null);

export function NavigationExitView({ children, enabled = true, scale = 0.88, style }: {
  children: ReactNode; enabled?: boolean; scale?: number; style?: StyleProp<ViewStyle>;
}) {
  const transition = useContext(NavigationTransitionContext);
  const progress = enabled && transition?.outgoing ? transition.progress : undefined;
  return <Animated.View style={[style, progress && {
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) }],
  }]}>{children}</Animated.View>;
}
