import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { useAnimatedShaderUniforms } from "@legend-apps/presentation";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { branchMaterialShader } from "slides:materials/BranchMaterial";
type Point = { x: number; y: number };
type RGB = readonly [number, number, number];
export type BranchFanGeometry = { root: Point; ends: readonly Point[]; strands?: number; twist?: number;
  tint?: RGB; light?: RGB; emphasisTint?: RGB; emphasisLight?: RGB; };
export function createBranchFanShader({ root, ends, strands = 2, twist = 13, tint = [0.08,0.58,1], light = [0.6,0.91,1],
  emphasisTint = [1,0.08,0.14], emphasisLight = [1,0.65,0.65] }: BranchFanGeometry) {
  if (![root.x, root.y, twist, ...ends.flatMap(point => [point.x, point.y])].every(Number.isFinite) || !ends.length || ends.length > 32 ||
      ends.some(point => point.y <= root.y) || !Number.isInteger(strands) || strands < 1 || strands > 4 ||
      [...tint, ...light, ...emphasisTint, ...emphasisLight].some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error("Invalid downward branch fan geometry or palette");
  return `
uniform float time;
uniform float emphasis;
uniform float stepTime;
${branchMaterialShader}
half4 main(float2 p) {
  // Step identity and elapsed time come from the same UI-thread clock snapshot.
  float colorMix=emphasis*smoothstep(0.0,1.2,stepTime);
  float3 tint=mix(float3(${tint.join(",")}),float3(${emphasisTint.join(",")}),colorMix);
  float3 light=mix(float3(${light.join(",")}),float3(${emphasisLight.join(",")}),colorMix);
  float3 color=float3(0);
  for(int i=0;i<${ends.length};i++) {
    float2 endpoint=${ends.map((point,index) => `${index < ends.length - 1 ? `i==${index} ? ` : ""}float2(${point.x},${point.y})`).join(" : ")};
    float t=clamp((p.y-${root.y})/(endpoint.y-${root.y}),0.0,1.0);
    float bend=t*t*(3.0-2.0*t);
    float center=mix(${root.x},endpoint.x,bend);
    float slope=(endpoint.x-${root.x})*6.0*t*(1.0-t)/(endpoint.y-${root.y});
    for(int strand=0;strand<${strands};strand++) {
      float phase=float(i)*0.7+float(strand)*3.14159;
      float offset=sin(t*8.0+phase)*sin(t*3.14159)*${twist};
      float d=(p.x-center-offset)/sqrt(1.0+slope*slope);
      float fade=smoothstep(${root.y - 5},${root.y + 20},p.y)*(1.0-smoothstep(endpoint.y,endpoint.y+15.0,p.y));
      float3 ribbon=branchRibbon(d,t,phase,time,tint,light);
      color=max(color,ribbon*fade);
    }
    float tip=length(p-endpoint);
    color+=tint*(exp(-tip*0.25)+exp(-tip*0.065)*0.16);
  }
  float alpha=clamp(max(color.r,max(color.g,color.b)),0.0,1.0);
  return half4(min(color,float3(alpha)),alpha);
}`;
}
const effects = new Map<string, NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>>();
function compileFan(source: string) {
  let effect = effects.get(source);
  if (!effect) {
    effect = Skia.RuntimeEffect.Make(source) ?? undefined;
    if (!effect) throw new Error("Could not compile branch fan");
    if (effects.size >= 32) effects.delete(effects.keys().next().value!);
    effects.set(source, effect);
  }
  return effect;
}
export function BranchFan({ geometry, width, height, emphasized = false, active = true, style }: {
  geometry: BranchFanGeometry; width: number; height: number; emphasized?: boolean; active?: boolean; style?: StyleProp<ViewStyle>; }) {
  const effect = useMemo(() => compileFan(createBranchFanShader(geometry)), [geometry]);
  const uniforms = useAnimatedShaderUniforms({ emphasis: emphasized ? 1 : 0 }, 8, { active });
  return <Canvas pointerEvents="none" style={[{ width, height }, style]}><Fill><Shader source={effect} uniforms={uniforms} /></Fill></Canvas>;
}
