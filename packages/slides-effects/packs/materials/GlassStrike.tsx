import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { useAnimatedShaderUniforms } from "@legend-apps/presentation";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { glassPanelMaterial } from "./GlassPanels";
export const glassStrikeShader = `
const float halfWidth = 251.0;
const float radius = 40.0;
const float centerY = 300.0;
const float materialScale = 1.0;
const float3 strikeTint = float3(1.0,0.045,0.025);
const float3 checkTint = float3(0.12,0.95,0.38);
const float2 strokeA = float2(-302.0,-240.0);
const float2 strokeB = float2(306.0,238.0);
const float2 strokeC = float2(298.0,-245.0);
const float2 strokeEnd = float2(-309.0,246.0);
uniform float time;
uniform float slideTime;
uniform float broken;
uniform float resolveToCheck;
uniform float settled;
uniform float phase;
uniform float centerX;
uniform float panelHalfHeight;
const float pulse = 0.0;
const float edgeMotion = 0.0;
${glassPanelMaterial}
float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
float2 rotatePoint(float2 p, float a) {
  float c = cos(a), s = sin(a);
  return float2(c*p.x-s*p.y, s*p.x+c*p.y);
}
float box(float2 p) {
  return glassBox(p, float2(halfWidth, panelHalfHeight + radius), radius);
}
float stroke(float2 p, float2 a, float2 b, float progress) {
  float2 v = (b-a) * max(progress, 0.001);
  return length(p-a-v*clamp(dot(p-a,v)/dot(v,v), 0.0, 1.0));
}
float4 glass(float2 p, float clock) {
  return glassPanel(p, float2(halfWidth, panelHalfHeight + radius), radius, clock);
}
half4 main(float2 position) {
  float2 p = (position-float2(centerX,centerY))/materialScale;
  float clock = slideTime+phase;
  float elapsed = min(mix(time,6.0,settled),6.0);
  float resolve = resolveToCheck*broken*smoothstep(1.2,2.2,elapsed);
  float impact = broken*step(0.38,elapsed);
  float flight = max(elapsed-0.38,0.0);
  float travel = 1.0-exp(-flight*3.8);
  float extent = length(float2(halfWidth,panelHalfHeight+radius))+1.0;
  float reach = 175.0*travel+flight*35.0;
  if (impact > 0.5) {
    if (abs(p.x) > max(672.0,extent+reach)) return half4(0);
    if (flight >= 4.0) {
      if (resolveToCheck == 0.0) return half4(0);
      // Keep the check's strokes, spark trajectories and their glow margins.
      if (resolve >= 1.0 && (abs(p.x) > 360.0 || p.y < -192.0 || p.y > 512.0)) return half4(0);
    }
  }
  float4 result = float4(0.0);
  if (impact < 0.5) {
    result = glass(p,clock);
  } else if (flight < 4.0) {
    if (abs(p.x) <= extent+reach && p.y >= flight*flight*140.0-extent-reach
        && p.y <= flight*flight*210.0+extent+reach) {
      // Cut the actual panel into 18 irregular radial shards. Inverse-transform
      // each shard so its original glass reflection travels with the fragment.
      for (int i=0; i<18; i++) {
        float id = float(i);
        float start = id + (i == 0 ? 0.0 : (hash(id+7.0)-0.5)*0.55);
        float end = id+1.0 + (i == 17 ? 0.0 : (hash(id+8.0)-0.5)*0.55);
        float a = (start/18.0)*6.283185-3.141593;
        float width = (end-start)*6.283185/18.0;
        float random = hash(id+phase);
        float2 direction = float2(cos(a+width*0.5),sin(a+width*0.5));
        float distance = (30.0+random*145.0)*travel;
        float2 offset = direction*(distance+flight*35.0) + float2(0.0,flight*flight*(140.0+70.0*random));
        float spin = (random-0.5)*(travel*1.1+flight*1.6);
        float2 delta = p-offset;
        if (any(greaterThan(abs(delta),float2(extent)))) continue;
        float2 original = rotatePoint(delta,-spin);
        if (box(original) >= 1.0) continue;
        float theta = atan(original.y,original.x);
        float wedge = step(a,theta)*(1.0-step(a+width,theta));
        if (wedge > 0.5) {
          float4 shard = glass(original,0.38+phase);
          float edgeDistance = length(original)*min(theta-a,a+width-theta);
          float edge = exp(-edgeDistance*0.85);
          shard.rgb += float3(0.52,0.82,1.0)*edge*shard.a;
          result = shard + result*(1.0-shard.a);
        }
      }
    }
    // Small angular chips burst out faster than the large pieces.
    for (int j=0; j<12; j++) {
      float id = float(j);
      float a = id*2.39996;
      float random = hash(id+41.0);
      float2 center = float2(cos(a),sin(a))*(180.0+travel*(80.0+random*140.0));
      center.y += flight*flight*(160.0+random*80.0);
      float2 delta = p-center;
      if (any(greaterThan(abs(delta),float2(24.0)))) continue;
      float2 q = rotatePoint(delta,a+flight*3.0);
      float triangle = max(abs(q.x)*0.866+q.y*0.5,-q.y)-(4.0+random*7.0);
      float alpha = 1.0-smoothstep(-0.5,0.7,triangle);
      float4 chip = float4(float3(0.58,0.84,1.0)*alpha,alpha);
      result = chip+result*(1.0-chip.a);
    }
  }
  if (broken > 0.5) {
    // Deliberately overshoot the panel: two furious strokes, then the impact.
    float first = clamp(elapsed/0.17,0.0,1.0);
    float second = clamp((elapsed-0.21)/0.17,0.0,1.0);
    float2 a = mix(strokeA,float2(-92.0,108.0),resolve);
    float2 b = mix(strokeB,float2(-25.0,178.0),resolve);
    float2 c = mix(strokeC,float2(104.0,66.0),resolve);
    float2 end = mix(strokeEnd,float2(-25.0,178.0),resolve);
    float d = stroke(p,a,b,first);
    float e = stroke(p,c,end,second);
    float distance = min(d+10000.0*(1.0-step(0.001,first)),e+10000.0*(1.0-step(0.001,second)));
    float roughness = sin(p.x*0.15+p.y*0.22)*0.8+sin(p.y*0.43)*0.6;
    float pulse = (0.5+0.5*sin(time*mix(7.0,3.5,resolve)));
    float thickness = mix(17.0,11.0,resolve)+pulse*3.5;
    float line = 1.0-smoothstep(thickness+roughness,thickness+4.0+roughness,distance);
    float core = exp(-distance*distance*0.035);
    float glow = exp(-distance*0.045)*(0.60+pulse*0.25);
    float flash = impact*exp(-flight*12.0);
    float alpha = clamp(line+glow,0.0,1.0);
    float3 tint = mix(strikeTint,checkTint,resolve);
    float shimmer = pow(0.5+0.5*sin(p.x*0.045+p.y*0.025-time*mix(12.0,5.0,resolve)),8.0);
    float3 color = mix(tint,float3(1.0,0.96,0.8),clamp(core*0.6+shimmer*0.7,0.0,1.0));
    float4 slash = float4(color*alpha,alpha);
    slash *= 1.0-(1.0-resolveToCheck)*smoothstep(0.9,1.5,elapsed);
    result = slash+result*(1.0-slash.a);
    // Shape time settles, but the lifecycle-controlled GPU clock keeps the
    // success check shimmering and emitting green sparks while active.
    float particleVisibility = 1.0-(1.0-resolveToCheck)*smoothstep(0.9,1.5,elapsed);
    if (elapsed > 0.38 && particleVisibility > 0.0) {
      for (int k=0; k<24; k++) {
        float id = float(k);
        float seed = hash(id+71.0);
        float age = fract(time*0.85+seed);
        float along = hash(id+23.0);
        float2 origin = k < 12 ? mix(a,b,along) : mix(c,end,along);
        float angle = hash(id+107.0)*6.283185;
        float2 velocity = float2(cos(angle),sin(angle))*(45.0+seed*100.0);
        float2 center = origin+velocity*age+float2(0.0,age*age*45.0);
        float2 delta = p-center;
        if (any(greaterThan(abs(delta),float2(48.0)))) continue;
        float dist = length(delta);
        float life = sin(age*3.141593)*(0.75+pulse*0.25);
        life *= particleVisibility;
        float spark = (exp(-dist*dist/5.0)+0.25*exp(-dist*0.24))*life;
        float4 particle = float4(mix(tint,mix(float3(1.0,0.92,0.64),float3(0.65,1.0,0.78),resolve),0.45)*spark,spark);
        result = particle+result*(1.0-particle.a);
      }
    }
    result.rgb += float3(0.38,0.58,0.68)*flash*exp(-length(p)*0.009);
    result.a = max(result.a,flash*exp(-length(p)*0.009));
  }
  // The enclosing native canvas is transparent; return premultiplied color.
  return half4(min(result.rgb,float3(result.a)),result.a);
}`;
export type GlassStrikeGeometry = { centerY?: number; halfWidth?: number; radius?: number; scale?: number;
  strikeTint?: readonly [number, number, number]; checkTint?: readonly [number, number, number];
  strokePoints?: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]]; };
export function createGlassStrikeShader({ centerY = 300, halfWidth = 251, radius = 40, scale = 1,
  strikeTint = [1,0.045,0.025], checkTint = [0.12,0.95,0.38],
  strokePoints = [[-302,-240],[306,238],[298,-245],[-309,246]] }: GlassStrikeGeometry = {}) {
  if (strokePoints.length !== 4 || ![centerY, halfWidth, radius, scale, ...strokePoints.flat()].every(Number.isFinite) || halfWidth <= 0 || radius < 0 || scale <= 0 ||
      [...strikeTint, ...checkTint].some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error("Invalid glass strike geometry or palette");
  const value = (n: number) => n.toFixed(6);
  let source = glassStrikeShader;
  for (const [name, number] of Object.entries({ centerY, halfWidth, radius, materialScale: scale })) {
    source = source.replace(new RegExp(`const float ${name} = [^;]+;`), `const float ${name} = ${value(number)};`);
  }
  for (const [index, name] of ["strokeA", "strokeB", "strokeC", "strokeEnd"].entries()) {
    source = source.replace(new RegExp(`const float2 ${name} = [^;]+;`), `const float2 ${name} = float2(${strokePoints[index].map(value).join(",")});`);
  }
  for (const [name, color] of Object.entries({ strikeTint, checkTint })) source = source.replace(new RegExp(`const float3 ${name} = [^;]+;`), `const float3 ${name} = float3(${color.map(value).join(",")});`);
  return source;
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
export function GlassStrike({ crossed = false, settled = false, resolveToCheck = true, centerX, phase = 0, panelHalfHeight = 151, trigger = "step", active = true,
  width, height, style, geometry }: { crossed?: boolean; settled?: boolean; resolveToCheck?: boolean; centerX: number; phase?: number; panelHalfHeight?: number;
  trigger?: "slide" | "step" | number; active?: boolean; width: number; height: number; style?: StyleProp<ViewStyle>; geometry?: GlassStrikeGeometry; }) {
  const effect = useMemo(() => compileStrike(createGlassStrikeShader(geometry)), [geometry]);
  const uniforms = useAnimatedShaderUniforms({ panelHalfHeight, resolveToCheck: resolveToCheck ? 1 : 0, broken: crossed ? 1 : 0,
    settled: settled ? 1 : 0, phase, centerX }, crossed ? 6 : 2, { active, clock: crossed && !settled ? trigger : "slide" });
  return <Canvas pointerEvents="none" style={[{ width, height }, style]}><Fill><Shader source={effect} uniforms={uniforms} /></Fill></Canvas>;
}
