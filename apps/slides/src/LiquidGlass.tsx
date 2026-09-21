import { liquidGlassShader as glassShader, renderNativeChildren, usePresentationValue } from "@legend-apps/presentation";
import type { Selector } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useEffect, type ReactNode } from "react";
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
  const isActive = usePresentationValue("isActive");
  const isPreview = usePresentationValue("isPreview");
  const target = active ? 1 : 0;
  const progress$ = useObservable(target);
  const setProgress = progress$.set;
  useEffect(() => {
    if (isPreview || !isActive || duration <= 0) {
      setProgress(target);
      return;
    }
    const from = progress$.peek();
    if (from === target) return;
    const epoch = performance.now();
    let frame = 0;
    const update = (now: number) => {
      const fraction = Math.min(1, (now - epoch) / duration);
      const eased = fraction * fraction * (3 - 2 * fraction);
      setProgress(from + (target - from) * eased);
      if (fraction < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [target, isActive, isPreview, duration, progress$, setProgress]);
  const displayedProgress = () => isPreview || !isActive ? target : progress$.get();
  const resolvedBlur = () => Math.max(0, blur) * displayedProgress();
  const uniforms = () => ({ progress: displayedProgress(), liquid: variant === "liquid" ? 1 : 0 });
  return (
    <View style={[styles.surface, style]}>
      <Effect shader={glassShader} blur={resolvedBlur}
        strength={Math.max(0, refraction)} speed={0}
        uniforms={uniforms}>
        {children}
      </Effect>
      {overlay !== undefined && <GlassOverlay progress={displayedProgress} target={target}>
        {renderNativeChildren(overlay, (text) => <Text>{text}</Text>)}
      </GlassOverlay>}
    </View>
  );
}
function GlassOverlay({ children, progress, target }: { children: ReactNode; progress: Selector<number>; target: number }) {
  const opacity = useValue(progress);
  return <View pointerEvents={target ? "auto" : "none"}
    accessibilityElementsHidden={!target} importantForAccessibility={target ? "auto" : "no-hide-descendants"}
    style={[styles.overlay, { opacity }]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: { position: "relative", borderRadius: 28, overflow: "hidden" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 48 },
});
