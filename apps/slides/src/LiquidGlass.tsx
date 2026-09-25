import Animated, { useAnimatedStyle, useDerivedValue } from "react-native-reanimated";
import { liquidGlassShader as glassShader, renderNativeChildren, usePlaybackTween } from "@legend-apps/presentation";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Effect } from "./Effect";


export type LiquidGlassProps = {
  children?: ReactNode;
  overlay?: ReactNode;
  active?: boolean;
  blur?: number;
  refraction?: number;
  duration?: number;
  variant?: "frosted" | "liquid";
  style?: StyleProp<ViewStyle>;
};

export function LiquidGlass({ children, overlay, active = false, blur = 24, refraction = 8,
  duration = 700, variant = "frosted", style }: LiquidGlassProps) {
  const target = active ? 1 : 0;
  const progress = usePlaybackTween({ progress: target }, duration, undefined, "smoothstep");
  const resolvedBlur = useDerivedValue(() => Math.max(0, blur) * progress.value.progress);
  const uniforms = useDerivedValue(() => ({ progress: progress.value.progress, liquid: variant === "liquid" ? 1 : 0 }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value.progress }));
  return (
    <View style={[styles.surface, style]}>
      <Effect shader={glassShader} blur={resolvedBlur}
        strength={Math.max(0, refraction)} speed={0}
        uniforms={uniforms}>
        {children}
      </Effect>
      {overlay !== undefined && <Animated.View pointerEvents={active ? "auto" : "none"} accessibilityElementsHidden={!active}
        importantForAccessibility={active ? "auto" : "no-hide-descendants"} style={[styles.overlay, overlayStyle]}>
        {renderNativeChildren(overlay, (text) => <Text>{text}</Text>)}
      </Animated.View>}
    </View>
  );
}
const styles = StyleSheet.create({
  surface: { position: "relative", borderRadius: 28, overflow: "hidden" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 48 },
});
