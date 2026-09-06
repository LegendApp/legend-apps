import { Canvas, Fill, Shader, Skia, vec } from "@shopify/react-native-skia";
import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

const width = 1680;
const height = 920;

const ambientAurora = Skia.RuntimeEffect.Make(`
  uniform float2 resolution;
  uniform float time;
  uniform float phase;
  uniform float intensity;

  half4 main(float2 position) {
    float2 uv = position / resolution;
    float drift = time * 0.025 + phase;
    float2 cyanCenter = float2(0.16 + sin(drift * 1.3) * 0.08, 0.28 + cos(drift) * 0.05);
    float2 violetCenter = float2(0.78 + cos(drift * 0.8) * 0.07, 0.62 + sin(drift * 1.1) * 0.06);
    float cyan = exp(-length((uv - cyanCenter) * float2(1.0, 1.35)) * 5.2);
    float violet = exp(-length((uv - violetCenter) * float2(1.0, 1.2)) * 4.8);
    float ribbon = smoothstep(0.2, 0.95, sin((uv.x * 1.15 + uv.y * 0.7 + drift) * 4.0) * 0.5 + 0.5);
    ribbon *= 1.0 - smoothstep(0.15, 0.9, abs(uv.y - 0.5));
    float3 color = float3(0.031, 0.047, 0.078);
    color += float3(0.03, 0.58, 0.68) * cyan * 0.23 * intensity;
    color += float3(0.32, 0.12, 0.62) * violet * 0.2 * intensity;
    color += float3(0.02, 0.18, 0.26) * ribbon * 0.08 * intensity;
    float vignette = 1.0 - smoothstep(0.25, 0.95, length(uv - 0.5));
    color *= mix(0.72, 1.0, vignette);
    return half4(color, 1.0);
  }
`);

export function AmbientAurora({ intensity = 1 }: { intensity?: number }) {
  const { isActive, isPreview, slideIndex, startedAt } = useSlideLifecycle();
  const [time, setTime] = useState(isPreview ? 8 : 0);

  useEffect(() => {
    if (isPreview) {
      setTime(8);
      return;
    }
    if (!isActive) return;
    let frame = 0;
    const epoch = startedAt ?? performance.now();
    const update = (now: number) => {
      setTime(Math.max(0, now - epoch) / 1000);
      frame = requestAnimationFrame(update);
    };
    setTime(Math.max(0, performance.now() - epoch) / 1000);
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isActive, isPreview, startedAt]);

  if (!ambientAurora) return null;

  return (
    <View pointerEvents="none" style={styles.fill}>
      <Canvas style={styles.fill}>
        <Fill>
          <Shader
            source={ambientAurora}
            uniforms={{
              intensity,
              phase: slideIndex * 0.47,
              resolution: vec(width, height),
              time,
            }}
          />
        </Fill>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { height, width },
});
