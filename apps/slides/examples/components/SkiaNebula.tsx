import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { useAnimatedShaderUniforms } from "@legend-apps/presentation";

import { StyleSheet, Text, View } from "react-native";

const canvasWidth = 1500;
const canvasHeight = 560;
const nebulaEffect = Skia.RuntimeEffect.Make(`
  uniform float2 resolution;
  uniform float time;

  half4 main(float2 position) {
    float2 uv = (position * 2.0 - resolution) / min(resolution.x, resolution.y);
    float radius = length(uv);
    float folds = sin((uv.x + uv.y) * 7.0 + time * 1.4)
      * cos((uv.x - uv.y) * 6.0 - time * 1.1);
    float wave = sin(radius * 24.0 - time * 4.0 + folds * 2.2);
    float ring = 0.055 / (abs(wave) + 0.055);
    float pulseRadius = 0.38 + sin(time * 1.8) * 0.06;
    float pulse = 0.035 / (abs(radius - pulseRadius) + 0.02);
    float core = 0.025 / max(radius, 0.04);
    float vignette = 1.0 - smoothstep(0.45, 1.55, radius);
    float3 color = float3(0.04, 0.55, 1.0) * ring;
    color += float3(0.9, 0.08, 0.95) * pulse;
    color += float3(0.15, 0.95, 0.8) * core;
    color *= vignette;
    return half4(color, 1.0);
  }
`);

export function SkiaNebula() {
  const uniforms = useAnimatedShaderUniforms({ resolution: [canvasWidth, canvasHeight] }, 3.4);

  if (!nebulaEffect) {
    return <Text style={styles.error}>The Skia runtime shader could not be compiled.</Text>;
  }

  return (
    <View style={styles.frame}>
      <Canvas style={styles.canvas}>
        <Fill>
          <Shader
            source={nebulaEffect}
            uniforms={uniforms}
          />
        </Fill>
      </Canvas>
      <View pointerEvents="none" style={styles.label}>
        <Text style={styles.eyebrow}>SKIA RUNTIME EFFECT</Text>
        <Text style={styles.title}>A shader drawn inside the slide</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { height: canvasHeight, width: canvasWidth },
  error: { color: "#fda4af", fontSize: 28, marginTop: 36 },
  eyebrow: { color: "#67e8f9", fontSize: 22, fontWeight: "700", letterSpacing: 5 },
  frame: {
    borderColor: "#334155",
    borderRadius: 34,
    borderWidth: 2,
    height: canvasHeight,
    marginTop: 24,
    overflow: "hidden",
    width: canvasWidth,
  },
  label: { left: 52, position: "absolute", top: 42 },
  title: { color: "#fff", fontSize: 38, fontWeight: "700", marginTop: 10 },
});
