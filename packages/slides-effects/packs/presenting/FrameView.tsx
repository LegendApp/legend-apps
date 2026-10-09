import type { ReactNode } from "react";
import { TextInput, type ViewProps, type TextProps, type ViewStyle } from "react-native";
import Animated, { useAnimatedProps, useAnimatedStyle, useDerivedValue } from "react-native-reanimated";
import { Shader } from "@shopify/react-native-skia";

function flatten(value: any): ViewStyle {
  "worklet";
  if (!Array.isArray(value)) return value || {};
  return Object.assign({}, ...value.map(flatten));
}
export function FrameView({ frameStyle, ...props }: ViewProps & { frameStyle(): unknown }) {
  const style = useAnimatedStyle(() => flatten(frameStyle()));
  return <Animated.View {...props} style={[props.style, style]} />;
}
export function FrameText({ frameStyle, ...props }: TextProps & { frameStyle(): unknown }) {
  const style = useAnimatedStyle(() => flatten(frameStyle()));
  return <Animated.Text {...props} style={[props.style, style]} />;
}
const Input = Animated.createAnimatedComponent(TextInput);
export function FrameLabel({ frameText, frameStyle, style, ...props }: Omit<TextProps, "children"> & { frameText(): string; frameStyle?: () => unknown }) {
  const animatedProps = useAnimatedProps(() => ({ text: frameText(), defaultValue: frameText() }));
  const animatedStyle = useAnimatedStyle(() => flatten(frameStyle?.() ?? {}));
  return <Input {...props} editable={false} pointerEvents="none" underlineColorAndroid="transparent" animatedProps={animatedProps} style={[{ padding: 0 }, style, animatedStyle]} />;
}
export function FrameShader({ uniformsForFrame, ...props }: { uniformsForFrame(): any; source: any; children?: ReactNode }) {
  const uniforms = useDerivedValue(uniformsForFrame);
  return <Shader {...props} uniforms={uniforms} />;
}
