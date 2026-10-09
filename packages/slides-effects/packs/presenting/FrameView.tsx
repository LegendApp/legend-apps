import type { ViewProps, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

function flatten(value: any): ViewStyle {
  "worklet";
  if (!Array.isArray(value)) return value || {};
  return Object.assign({}, ...value.map(flatten));
}
export function FrameView({ frameStyle, ...props }: ViewProps & { frameStyle(): unknown }) {
  const style = useAnimatedStyle(() => flatten(frameStyle()));
  return <Animated.View {...props} style={[props.style, style]} />;
}
