import { renderNativeChildren, usePresentationValue } from "@legend-apps/presentation";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Effect } from "./Effect";

const glassShader = `
  uniform shader image;
  uniform float2 resolution;
  uniform float strength;
  uniform float time;
  uniform float progress;
  uniform float liquid;
  half4 main(float2 p) {
    float2 uv = p / resolution;
    float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float rim = exp(-edge * 65.0);
    float2 normal = normalize(uv - 0.5 + float2(0.0001));
    float forming = sin(progress * 3.141593);
    float wave = sin(length(uv - 0.5) * 32.0 - progress * 15.0);
    float2 bend = normal * strength * (rim * progress + wave * forming * (0.4 + liquid));
    half4 color = image.eval(clamp(p + bend, float2(0.0), resolution - 1.0));
    float highlight = rim * (0.05 + 0.10 * max(0.0, 1.0 - uv.y));
    color.rgb = mix(color.rgb, half3(0.075, 0.12, 0.17) * color.a, progress * 0.16);
    color.rgb += half3(0.65, 0.88, 1.0) * (highlight * progress + forming * rim * 0.1) * color.a;
    return color;
  }
`;

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
  const displayedProgress$ = useObservable(() => isPreview || !isActive ? target : progress$.get(), [isPreview, isActive, target]);
  const blur$ = useObservable(() => Math.max(0, blur) * displayedProgress$.get(), [blur]);
  const uniforms$ = useObservable(() => ({ progress: displayedProgress$.get(), liquid: variant === "liquid" ? 1 : 0 }), [variant]);
  return (
    <View style={[styles.surface, style]}>
      <Effect shader={glassShader} blur={blur$}
        strength={Math.max(0, refraction)} speed={0}
        uniforms={() => uniforms$.get()}>
        {children}
      </Effect>
      {overlay !== undefined && <GlassOverlay progress$={displayedProgress$} target={target}>
        {renderNativeChildren(overlay, (text) => <Text>{text}</Text>)}
      </GlassOverlay>}
    </View>
  );
}
function GlassOverlay({ children, progress$, target }: { children: ReactNode; progress$: Observable<number>; target: number }) {
  const opacity = useValue(progress$);
  return <View pointerEvents={target ? "auto" : "none"}
    accessibilityElementsHidden={!target} importantForAccessibility={target ? "auto" : "no-hide-descendants"}
    style={[styles.overlay, { opacity }]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: { position: "relative", borderRadius: 28, overflow: "hidden" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 48 },
});
