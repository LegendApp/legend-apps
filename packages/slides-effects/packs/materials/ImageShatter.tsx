import { Canvas, Fill, ImageShader, Shader, Skia, useImage } from "@shopify/react-native-skia";
import { GPUShader, useAnimatedShaderUniforms } from "@legend-apps/presentation";
import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { createImageShatterGPU } from "./ImageShatterGPU";
export const imageShatterShader = `
const float2 halfSize = float2(520,355.319);
const float2 imageCenter = float2(960,600);
const float imageScale = 1.18;
const float cornerRadius = 18.0;
const float2 cellHalf = float2(104,88.82975);
const float2 firstCell = float2(-416.0,-266.48925);
const float2 cellPitch = float2(208.0,177.6595);
uniform shader screenshotImage;
uniform float time;
uniform float stepIndex;
uniform float revealAtStep;
float box(float2 p,float2 size,float r) {
  float2 q=abs(p)-size+r;
  return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;
}
float mask(float d) { return 1.0-smoothstep(-1.0,1.0,d); }
float4 screenshot(float2 p) {
  float a=mask(box(p,halfSize,cornerRadius));
  return screenshotImage.eval(p+halfSize)*a;
}
half4 main(float2 p) {
  // Enlarge both the intact screenshot and its shards with one camera transform.
  p=(p-imageCenter)/imageScale;
  if(stepIndex<revealAtStep || stepIndex>revealAtStep+1.0) return half4(0);
  if(stepIndex<revealAtStep+1.0) {
    float entrance=smoothstep(0.0,0.65,time);
    float2 source=(p-float2(0,48.0*(1.0-entrance)))/mix(0.9,1.0,entrance);
    return screenshot(source)*entrance;
  }
  float t=max(time,0.0);
  if(t>3.2) return half4(0);
  float4 color=float4(0);
  // Two independently tumbling triangles per cell; alternate the diagonal.
  // Keep 40 fragments total, matching the previous shader workload.
  for(int y=0;y<4;y++) for(int x=0;x<5;x++) for(int shard=0;shard<2;shard++) {
    float id=float((y*5+x)*2+shard);
    float side=shard==0 ? -1.0 : 1.0;
    float diagonal=mod(float(x+y),2.0)<0.5 ? -1.0 : 1.0;
    float2 offset=float2(side*diagonal*cellHalf.x/3.0,-side*cellHalf.y/3.0);
    float2 home=firstCell+float2(x,y)*cellPitch+offset;
    float seed=fract(sin(id*78.23+1.0)*43758.54);
    float2 velocity=float2(home.x*(0.6+seed),-240.0-seed*420.0);
    float2 center=home+velocity*t+float2(0,720.0*t*t);
    float angle=(seed-0.5)*t*11.0;
    float2 q=p-center;
    q=float2(q.x*cos(angle)+q.y*sin(angle),-q.x*sin(angle)+q.y*cos(angle));
    float2 cellPoint=q+offset;
    float cut=side*dot(cellPoint,normalize(float2(-cellHalf.y*diagonal,cellHalf.x)));
    float d=max(box(cellPoint,cellHalf,0.0),cut);
    float a=mask(d);
    float4 piece=screenshot(q+home)*a;
    float glint=exp(-abs(d)*1.3)*piece.a*(0.5+0.5*sin(t*17.0+id));
    piece.rgb+=float3(0.45,0.85,1)*glint*min(t*8.0,1.0);
    color=piece+color*(1.0-piece.a);
  }
  float flash=exp(-t*14.0)*exp(-length(p)/430.0)*min(t*50.0,1.0);
  color.rgb+=float3(0.5,0.85,1)*flash;
  color.a=max(color.a,flash);
  return half4(min(color.rgb,float3(color.a)),color.a);
}`;
export type ImageShatterGeometry = { imageWidth: number; imageHeight: number; centerX: number; centerY: number; scale?: number; radius?: number };
export function createImageShatterShader({ imageWidth, imageHeight, centerX, centerY, scale = 1.18, radius = 18 }: ImageShatterGeometry) {
  if (![imageWidth, imageHeight, centerX, centerY, scale, radius].every(Number.isFinite) || imageWidth <= 0 || imageHeight <= 0 || scale <= 0 || radius < 0) throw new Error("Invalid image shatter geometry");
  const value = (n: number) => n.toFixed(6);
  const constants: Record<string, number[]> = { halfSize: [imageWidth / 2, imageHeight / 2], imageCenter: [centerX, centerY],
    cellHalf: [imageWidth / 10, imageHeight / 8], firstCell: [-imageWidth * .4, -imageHeight * .375], cellPitch: [imageWidth / 5, imageHeight / 4] };
  let source = imageShatterShader;
  for (const [name, numbers] of Object.entries(constants)) source = source.replace(new RegExp(`const float2 ${name} = [^;]+;`), `const float2 ${name} = float2(${numbers.map(value).join(",")});`);
  return source.replace(/const float imageScale = [^;]+;/, `const float imageScale = ${value(scale)};`)
    .replace(/const float cornerRadius = [^;]+;/, `const float cornerRadius = ${value(radius)};`);
}
const effects = new Map<string, NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>>();
function compileShatter(source: string) {
  let effect = effects.get(source);
  if (!effect) {
    effect = Skia.RuntimeEffect.Make(source) ?? undefined;
    if (!effect) throw new Error("Could not compile image shatter");
    if (effects.size >= 32) effects.delete(effects.keys().next().value!);
    effects.set(source, effect);
  }
  return effect;
}
function SkiaImageShatter({ source, revealAtStep, geometry, width, height, style, accessibilityLabel }: { source: string; revealAtStep: number;
  geometry: ImageShatterGeometry; width: number; height: number; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const image = useImage(source);
  const effect = useMemo(() => compileShatter(createImageShatterShader(geometry)), [geometry]);
  const uniforms = useAnimatedShaderUniforms({ revealAtStep }, 4, { clock: "step" });
  return image && <Canvas pointerEvents="none" accessibilityLabel={accessibilityLabel} style={[{ width, height }, style]}>
    <Fill><Shader source={effect} uniforms={uniforms}><ImageShader image={image} fit="contain"
      rect={{ x: 0, y: 0, width: geometry.imageWidth, height: geometry.imageHeight }} tx="clamp" ty="clamp" /></Shader></Fill>
  </Canvas>;
}

export function ImageShatter(props: Parameters<typeof SkiaImageShatter>[0]) {
  const { source, revealAtStep, geometry, width, height, style, accessibilityLabel } = props;
  const code = useMemo(() => createImageShatterGPU(geometry, width, height, revealAtStep), [geometry, width, height, revealAtStep]);
  return <View style={[{ width, height }, style]} pointerEvents="none">
    <GPUShader code={code} width={width} height={height} image={source} particles particleCount={40}
      particleBlend="over" borderRadius={0} accessibilityLabel={accessibilityLabel}
      fallback={<SkiaImageShatter {...props} style={undefined} />} />
  </View>;
}
