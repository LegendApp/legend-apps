import { createFallingSpritesGPU } from "./FallingSpritesGPU";
import { GPUShader, FocusSurfaceContext, useAnimatedShaderUniforms } from "@legend-apps/presentation";
import { Canvas, Fill, Shader, Skia } from "@shopify/react-native-skia";
import { useContext, useMemo, useRef, useState } from "react";
import { View } from "react-native";
export function FallingSprites({ width, barHeight, x, y, sprite, accessibilityLabel }: { width:number; barHeight:number; x:number; y:number; sprite:string; accessibilityLabel?:string }) {
  const surface = useContext(FocusSurfaceContext)?.surface;
  const ref = useRef<View>(null);
  const [floorY, setFloorY] = useState(1056);
  const program = useMemo(() => createFallingSpritesGPU(width, barHeight, floorY), [width, barHeight, floorY]);
  const measureFloor = () => {
    if (surface?.root) ref.current?.measureLayout(surface.root, (_left, top) => {
      if (surface.height > 0) setFloorY(surface.height - top - 24);
    });
  };
  return <View ref={ref} collapsable={false} onLayout={measureFloor} pointerEvents="none"
    style={{ position: "absolute", zIndex: 1, left: x - 128, top: y - 184, width: width + 256, height: 184 + barHeight }}>
    <GPUShader {...program} particles image={sprite} width={width + 256} height={floorY + 24} particleBlend="over"
      previewTime={5.4} borderRadius={0} accessibilityLabel={accessibilityLabel} />
  </View>;
}

export const flameSource = `
uniform float time;
uniform float fireWidth;
uniform float barHeight;

float hash(float2 p) {
  return fract(sin(dot(p,float2(127.1,311.7)))*43758.5453);
}
float noise(float2 p) {
  float2 i=floor(p), f=fract(p);
  float2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+float2(1,0)),u.x),
    mix(hash(i+float2(0,1)),hash(i+float2(1,1)),u.x),u.y);
}
float turbulence(float2 p) {
  float n=0.0, amplitude=0.5;
  for(int i=0;i<4;i++) {
    n+=amplitude*noise(p);
    p=p*2.03+float2(19.1,7.7);
    amplitude*=0.5;
  }
  return n;
}
half4 main(float2 p) {
  float ignition=smoothstep(0.0,5.0,time);
  if(ignition<=0.0) return half4(0);
  float x=p.x-128.0, h=190.0-p.y;
  float edge=smoothstep(-18.0,12.0,x)*(1.0-smoothstep(fireWidth-12.0,fireWidth+18.0,x));
  float3 color=float3(0);
  float alpha=0.0;
  if(p.y<184.0+barHeight+25.0) {
    float spread=smoothstep(-18.0,24.0,190.0*ignition-h);
    float drift=sin(time*1.4+h*0.022)*12.0;
    float2 flow=float2((x+drift)*0.026,h*0.026-time*1.9);
    float warp=(turbulence(flow*0.53)-0.47)*42.0*clamp(h/100.0,0.0,1.0);
    float billow=turbulence(flow+float2(warp*0.025,0));
    float height=(75.0+100.0*turbulence(float2(x*0.022,time*0.75)))*(0.3+0.7*ignition);
    float detail=noise(flow*3.1+float2(0,-time*1.3));
    float tongue=0.82-h/height+(billow-0.46)*0.92+(detail-0.5)*0.09;
    float body=smoothstep(0.02,0.15,tongue)*edge*smoothstep(-35.0,-13.0,h)*ignition*spread;
    float heat=clamp(tongue*1.08+(detail-0.5)*0.13,0.0,1.0);
    float3 flame=mix(float3(0.85,0.055,0.005),float3(1.0,0.40,0.025),smoothstep(0.05,0.5,heat));
    flame=mix(flame,float3(1.0,0.86,0.27),smoothstep(0.38,0.8,heat));
    flame=mix(flame,float3(1.0,0.98,0.80),smoothstep(0.88,1.0,heat));
    float glow=exp(-abs(h-8.0)*0.025)*edge*(0.7+0.3*billow)*0.32*ignition*spread;
    color=float3(1.0,0.16,0.015)*glow;
    alpha=glow;
    color=flame*body+color*(1.0-body);
    alpha=body+alpha*(1.0-body);

    // Neighboring emission lanes bound the particle work per fragment.
    float lane=floor(x/42.0);
    for(int neighbor=-1;neighbor<=1;neighbor++) for(int layer=0;layer<3;layer++) {
      float id=lane+float(neighbor);
      float seed=hash(float2(id,float(layer)+31.0));
      float cycle=time*(0.48+seed*0.48)+seed*11.0;
      float age=fract(cycle);
      float origin=(id+0.15+seed*0.7)*42.0;
      if(origin<0.0 || origin>fireWidth) continue;
      float lift=age*(125.0+seed*60.0);
      float sway=sin(age*5.0+seed*19.0)*14.0+age*18.0;
      float2 delta=float2(x-origin-sway,h-lift);
      float radius=0.8+seed*1.0;
      float spark=exp(-dot(delta/float2(radius,radius*2.1),delta/float2(radius,radius*2.1))*1.5);
      float halo=exp(-dot(delta,delta)*0.07)*0.18;
      float life=smoothstep(0.02,0.13,age)*(1.0-smoothstep(0.65,1.0,age));
      float ember=(spark+halo)*life*ignition*smoothstep(-18.0,24.0,190.0*ignition-lift);
      color+=float3(1.0,0.46+seed*0.32,0.08)*ember;
      alpha+=ember;
    }
  }
  float bounds=smoothstep(0.0,14.0,p.y);
  alpha=clamp(alpha,0.0,1.0)*bounds;
  return half4(min(color*bounds,float3(alpha)),alpha);
}`;
let flameEffect: NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>;
export function Flames({ width, barHeight, x, y, accessibilityLabel }: { width: number; barHeight: number; x: number; y: number; accessibilityLabel?: string }) {
  if (!flameEffect) {
    flameEffect = Skia.RuntimeEffect.Make(flameSource)!;
    if (!flameEffect) throw new Error("Could not compile upward flames");
  }
  const uniforms = useAnimatedShaderUniforms({ fireWidth: width, barHeight }, 5.4, { clock: "step" });
  return <View pointerEvents="none" style={{ position: "absolute", zIndex: 0, left: x - 128, top: y - 184, width: width + 256, height: 184 + barHeight }}>
    <Canvas pointerEvents="none" accessibilityLabel={accessibilityLabel} style={{ position: "absolute", left: 0, top: 0, width: width + 256, height: 184 + barHeight + 25 }}>
      <Fill><Shader source={flameEffect} uniforms={uniforms} /></Fill>
    </Canvas>
  </View>;
}
