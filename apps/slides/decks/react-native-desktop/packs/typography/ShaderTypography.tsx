import { Canvas, Fill, Mask, Shader, Skia, Text as SkiaText, matchFont, vec } from "@shopify/react-native-skia";
import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, loopTime, type EffectProfileProps } from "../shared/effectProfile";
import { useEffectTime } from "../shared/effectRuntime";

const width = 1680;
const height = 470;
const font = matchFont({ fontFamily: "Helvetica Neue", fontSize: 250, fontWeight: "800" });

const energyType = Skia.RuntimeEffect.Make(`
  uniform float2 resolution;
  uniform float time;
  uniform float intensity;

  half4 main(float2 position) {
    float2 uv = position / resolution;
    float ribbon = sin(uv.x * 18.0 - time * 3.2 + sin(uv.y * 9.0) * 1.7);
    float bands = smoothstep(0.25, 0.95, ribbon * 0.5 + 0.5);
    float scan = exp(-abs(fract(uv.x - time * 0.15) - 0.5) * 13.0);
    float grain = fract(sin(dot(floor(position * 0.18), float2(12.9898, 78.233))) * 43758.5453);
    float3 cyan = float3(0.18, 0.92, 1.0);
    float3 violet = float3(0.49, 0.46, 1.0);
    float3 hot = float3(1.0, 0.38, 0.6);
    float3 color = mix(cyan, violet, uv.x + sin(time) * 0.08);
    color = mix(color, hot, bands * intensity * 0.7);
    color += scan * float3(0.7, 0.95, 1.0) * (0.35 + intensity * 0.8);
    color += grain * 0.08 * intensity;
    return half4(color, 1.0);
  }
`);

export function ShaderTypography({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.64,
  tempo = "slow",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 7.2, 3.6);
  const amount = effectAmount(intensity, 0.38, 1);
  const time = useEffectTime(duration * previewProgress);
  const local = loopTime(time, duration, 0.8);

  return (
    <View style={styles.frame}>
      <View style={styles.mode}><Text style={styles.modeLabel}>{intensity.toUpperCase()} ENERGY</Text><Text style={styles.modeDetail}>{tempo} pass · {duration.toFixed(1)} s</Text></View>
      <Canvas style={styles.canvas}>
        <Mask mode="alpha" mask={<SkiaText color="white" font={font} text="NATIVE" x={72} y={305} />}>
          <Fill>
            {energyType && <Shader source={energyType} uniforms={{ intensity: amount, resolution: vec(width, height), time: local }} />}
          </Fill>
        </Mask>
      </Canvas>
      <Text style={[styles.echo, { opacity: 0.08 + amount * 0.12, transform: [{ translateX: Math.sin(time * 4.2) * amount * 8 }] }]}>NATIVE</Text>
      <Text style={styles.caption}>Typography can carry the transition instead of sitting on top of it.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { height, left: 0, position: "absolute", top: 62, width },
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  echo: { color: "#fb7185", fontSize: 250, fontWeight: "800", left: 72, letterSpacing: -12, position: "absolute", top: 126 },
  frame: { height: 580, overflow: "hidden", position: "relative", width },
  mode: { alignItems: "baseline", flexDirection: "row", gap: 20, left: 48, position: "absolute", top: 14 },
  modeDetail: { color: "#64748b", fontSize: 17 },
  modeLabel: { color: "#67e8f9", fontSize: 17, fontWeight: "800", letterSpacing: 4 },
});
