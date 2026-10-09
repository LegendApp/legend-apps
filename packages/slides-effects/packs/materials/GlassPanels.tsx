import { Fill, Shader, Skia } from "@shopify/react-native-skia";
import { PresentationCanvas, useAnimatedShaderUniforms } from "@legend-apps/presentation";
import { useMemo } from "react";

export type GlassPanelShape = { x: number; y: number; width: number; height: number; radius?: number };

// Analytic lighting, not backdrop capture: one GPU surface for a group of panels.
// Circle/bubble shapes use equal width/height and radius = width / 2.
export const glassPanelMaterial = `
float glassBox(float2 p,float2 size,float radius) {
  float2 q=abs(p)-size+radius;
  return length(max(q,0.0))+min(max(q.x,q.y),0.0)-radius;
}
float4 glassPanel(float2 p,float2 size,float radius,float clock) {
  // Bound the glow before evaluating the expensive lighting material.
  if(any(greaterThan(abs(p),size*(1.0+abs(pulse))+float2(120.0+abs(edgeMotion))))) return float4(0);
  float breath=0.5+0.5*sin(clock*0.85);
  float angle=atan(p.y,p.x);
  float2 breathingSize=size*(1.0+pulse*(breath-0.5));
  float d=glassBox(p,breathingSize,radius);
  d+=edgeMotion*(0.65*sin(angle*3.0+clock*0.45)+0.35*sin(angle*5.0-clock*0.3));
  float mask=1.0-smoothstep(-0.8,0.8,d);
  float2 uv=p/size;
  // A translucent pearl body, with broad diffusion instead of a blue tint.
  float top=exp(-pow((uv.y+0.92)/0.40,2.0));
  float bottom=exp(-pow((uv.y-0.92)/0.28,2.0));
  float sweepAxis=(uv.y+uv.x*0.42+0.35*sin(clock*0.23))/0.65;
  float sweep=exp(-sweepAxis*sweepAxis);
  float frost=0.085+0.035*top+0.018*sweep;
  float3 body=float3(0.96,0.97,0.98)*frost*0.75;

  // Opposing reflections and an inset caustic give the lip optical thickness.
  // One slow revolution every 48 seconds, driven entirely by the GPU clock.
  float lightAngle=2.3+clock*0.130899694;
  float direction=pow(0.5+0.5*cos(angle-lightAngle),4.0);
  float counter=pow(0.5+0.5*cos(angle-lightAngle+3.1),6.0);
  float edge=exp(-abs(d+0.7)*1.8);
  float bevel=exp(-abs(d+3.0)*0.48)*mask;
  float caustic=exp(-abs(d+8.0)*0.30)*mask;
  float outside=exp(-max(d,0.0)*0.18)*(1.0-mask);
  float reflection=edge*(0.22+0.58*direction+0.28*counter)
    +bevel*(0.04+0.13*direction)
    +caustic*(0.018+0.07*counter);
  float3 color=body*mask
    +float3(1.0,0.985,0.96)*reflection
    +float3(0.90,0.95,1.0)*bottom*mask*0.025
    +float3(0.95,0.97,1.0)*outside*0.025;
  float alpha=clamp(mask*(0.32+0.06*top+0.025*sweep)
    +reflection+outside*0.055,0.0,1.0);
  return float4(min(color,float3(alpha)),alpha);
}`;

export function createGlassPanelsShader(panels: readonly GlassPanelShape[]) {
  const number = (value: number) => value.toFixed(3);
  return `uniform float time;\nuniform float pulse;\nuniform float edgeMotion;\n${glassPanelMaterial}\nhalf4 main(float2 p) { float4 result=float4(0);\n${panels.map((panel, index) => `{
    float4 layer=glassPanel(p-float2(${number(panel.x + panel.width / 2)},${number(panel.y + panel.height / 2)}),float2(${number(panel.width / 2)},${number(panel.height / 2)}),${number(panel.radius ?? 24)},time+${number(index * 1.7)});
    result=layer+result*(1.0-layer.a);
  }`).join("\n")}\nreturn half4(result); }`;
}

// Shared across presenter, audience and prepared instances; bounded for edited decks.
const effects = new Map<string, NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>>();
function compilePanels(source: string) {
  const cached = effects.get(source);
  if (cached) return cached;
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) throw new Error("Could not compile glass panels");
  if (effects.size >= 32) effects.delete(effects.keys().next().value!);
  effects.set(source, effect);
  return effect;
}

/** Pass stable panel geometry. Pulsing and shimmer use the presentation GPU clock. */
export function GlassPanels({ panels, width, height, pulse = 0.003, edgeMotion = 1.2, active = true }: {
  active?: boolean;
  panels: readonly GlassPanelShape[];
  width: number;
  height: number;
  /** Fractional size variation; zero disables breathing without stopping shimmer. */
  pulse?: number;
  /** Edge displacement in logical slide pixels; zero keeps the contour rigid. */
  edgeMotion?: number;
}) {
  const effect = useMemo(() => compilePanels(createGlassPanelsShader(panels)), [panels]);
  const uniforms = useAnimatedShaderUniforms({ pulse, edgeMotion }, 8, { active });
  return <PresentationCanvas width={width} height={height}>
    <Fill><Shader source={effect} uniforms={uniforms} /></Fill>
  </PresentationCanvas>;
}
