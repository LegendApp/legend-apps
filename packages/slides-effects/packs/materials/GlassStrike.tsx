import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { GPUShader, useAnimatedShaderUniforms, useGPUShaderData } from "@legend-apps/presentation";
import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { glassPanelMaterial } from "./GlassPanels";
import { createGlassStrikeGPU, glassStrikeData, glassStrikeParticleCount } from "./GlassStrikeGPU";
export type GlassStrikeGeometry = { centerY?: number; halfWidth?: number; radius?: number; scale?: number;
  strikeTint?: readonly [number, number, number]; checkTint?: readonly [number, number, number];
  strokePoints?: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]]; };
export function createIntactGlassShader({ centerY = 300, halfWidth = 251, radius = 40, scale = 1 }: GlassStrikeGeometry = {}) {
  if (![centerY,halfWidth,radius,scale].every(Number.isFinite) || halfWidth <= 0 || radius < 0 || scale <= 0) throw new Error("Invalid glass strike geometry");
  return `
  uniform float time;
  uniform float phase;
  uniform float centerX;
  uniform float panelHalfHeight;
  const float pulse = 0.0;
  const float edgeMotion = 0.0;
  ${glassPanelMaterial}
  half4 main(float2 position) {
    float2 p=(position-float2(centerX,${centerY.toFixed(6)}))/${scale.toFixed(6)};
    return half4(glassPanel(p,float2(${halfWidth.toFixed(6)},panelHalfHeight+${radius.toFixed(6)}),${radius.toFixed(6)},time+phase));
  }`;
}
const effects = new Map<string, NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>>();
function compileStrike(source: string) {
  let effect = effects.get(source);
  if (!effect) {
    effect = Skia.RuntimeEffect.Make(source) ?? undefined;
    if (!effect) throw new Error("Could not compile glass strike");
    if (effects.size >= 32) effects.delete(effects.keys().next().value!);
    effects.set(source, effect);
  }
  return effect;
}
export function GlassStrike({ crossed = false, settled = false, resolveToCheck = true, centerX, phase = 0, panelHalfHeight = 151, trigger = "step", active = true, maxTime,
  width, height, style, geometry }: { crossed?: boolean; settled?: boolean; resolveToCheck?: boolean; centerX: number; phase?: number; panelHalfHeight?: number;
  trigger?: "slide" | "step" | number; active?: boolean; maxTime?: number; width: number; height: number; style?: StyleProp<ViewStyle>; geometry?: GlassStrikeGeometry; }) {
  const effect = useMemo(() => compileStrike(createIntactGlassShader(geometry)), [geometry]);
  const uniforms = useAnimatedShaderUniforms({ panelHalfHeight, resolveToCheck: resolveToCheck ? 1 : 0, broken: crossed ? 1 : 0,
    settled: settled ? 1 : 0, phase, centerX }, crossed ? 6 : 2, { active, maxTime, clock: crossed && !settled ? trigger : "slide" });
  const code = useMemo(() => createGlassStrikeGPU(width, height, geometry), [width, height, geometry]);
  const data = useGPUShaderData(uniforms, glassStrikeData);
  return <View pointerEvents="none" style={[{ width, height }, style]}>
    <GPUShader code={code} active={active && crossed} width={width} height={height} particles particleCount={glassStrikeParticleCount}
      particleBlend="over" composite frameData={data} frameDataSize={12} maxTime={maxTime} frameTimeIndex={0} borderRadius={0}>
      {!crossed && <Canvas style={{ position:"absolute", inset:0 }}><Fill><Shader source={effect} uniforms={uniforms} /></Fill></Canvas>}
    </GPUShader>
  </View>;
}
