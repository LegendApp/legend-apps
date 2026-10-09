import { useBackgroundInteractionUniforms, useAnimatedShaderUniforms, useBackgroundSize, useBackgroundIntensity } from "@legend-apps/presentation";
import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { StyleSheet, View } from "react-native";
export type AtmosphereProps = {
  /** Light output multiplier: 0 is black, 1 is the designed brightness. */
  brightness?: number;
  /** Motion multiplier: 0 holds a still frame, 1 is the designed speed. */
  speed?: number;
  /** Extra motion on slide changes, relative to speed. Set 0 to disable. */
  slideChangeBoost?: number;
  titleFeed?: number;
  bestRect?: number[];
  sharedUniforms?: { readonly value: Record<string, number | number[]> };
};
const effects = new Map<string, NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>>();
export function atmosphereEffect(source: string) {
  let effect = effects.get(source);
  if (!effect) {
    effect = Skia.RuntimeEffect.Make(source) ?? undefined;
    if (!effect) throw new Error("Could not compile atmosphere shader");
    effects.set(source, effect);
  }
  return effect;
}
export function Atmosphere({ source, persistentBackground = false, brightness = 1, speed = 1, slideChangeBoost, titleFeed = 0, bestRect = [0,0,0,0], sharedUniforms }: AtmosphereProps & { source: string; persistentBackground?: boolean }) {
  const intensity = useBackgroundIntensity();
  const { width, height } = useBackgroundSize();
  const effect = atmosphereEffect(source);
  const idleSpeed = 0.16;
  const motionSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 1;
  const uniforms = useAnimatedShaderUniforms({
    titleFeed, bestRect, backgroundTime: 0, drops: Array(288).fill(0),
    resolution: [Math.max(1, width), Math.max(1, height)],
    brightness: (Number.isFinite(brightness) ? Math.max(0, brightness) : 1) * intensity,
  }, 8, {
    persistentBackground,
    speed: motionSpeed * idleSpeed,
    slideChangeBoost: motionSpeed * (slideChangeBoost ?? idleSpeed * 2),
    slideChangeDuration: 3.5,
  });
  const backgroundUniforms = useBackgroundInteractionUniforms(uniforms, sharedUniforms);
  return (
    <View pointerEvents="none" style={styles.fill}>
      <Canvas style={styles.fill}>
        <Fill><Shader source={effect} uniforms={backgroundUniforms} /></Fill>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { ...StyleSheet.absoluteFillObject } });
