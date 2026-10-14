import type { ViewProps, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useDerivedValue } from "react-native-reanimated";

function flatten(value: any): ViewStyle {
  "worklet";
  if (!Array.isArray(value)) return value || {};
  return Object.assign({}, ...value.map(flatten));
}
export function FrameView({ frameStyle, ...props }: ViewProps & { frameStyle(): unknown }) {
  const frame = useDerivedValue(frameStyle);
  const style = useAnimatedStyle(() => flatten(frame.value));
  return <Animated.View {...props} style={[props.style, style]} />;
}
