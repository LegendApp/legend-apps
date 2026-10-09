import { FocusSurfaceContext, useAnimatedShaderUniforms } from "@legend-apps/presentation";
import { Canvas, Fill, ImageShader, Shader, Skia, useImage } from "@shopify/react-native-skia";
import { useContext, useRef, useState } from "react";
import { View } from "react-native";
export const spriteFireShader = `
uniform float time;
uniform float fireWidth;
uniform float barHeight;
uniform float floorY;
uniform float drops;
uniform shader poopImage;

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
float4 poop(float2 p,float2 center,float2 size,float angle) {
  float2 q=p-center;
  q=float2(q.x*cos(angle)+q.y*sin(angle),-q.x*sin(angle)+q.y*cos(angle))/size;
  if(abs(q.x)>0.5 || abs(q.y)>0.5) return float4(0);
  return poopImage.eval((q+0.5)*256.0);
}
float4 splash(float2 p,float id,float generation,float local,float period,float origin,float release,float sourceY,bool settled) {
  float variation=hash(float2(id,generation+57.0));
  float size=42.0+63.0*variation*variation;
  float ground=floorY-generation*20.0;
  float impact=release+sqrt(max(1.0,ground-size*0.4-sourceY)/510.0);
  float hit=local-generation*period-impact;
  if(hit<0.0 || p.y<ground-110.0 || p.y>ground+14.0) return float4(0);
  float4 result=float4(0);
  for(int bead=0;bead<6;bead++) {
    float seed=hash(float2(id+float(bead)*13.0,generation+91.0));
    float smallSize=10.0+size*(0.133333+seed*0.20);
    float vx=(float(bead)-2.5)*46.0*(0.65+seed*0.6);
    float vy=110.0+seed*155.0;
    float landing=vy/420.0;
    if(settled ? hit<landing : hit>=landing) continue;
    float flying=min(hit,landing);
    float2 position=float2(origin+vx*flying,ground-smallSize*0.4
      -(settled ? 0.0 : vy*hit-420.0*hit*hit));
    float4 drop=poop(p,position,float2(smallSize),flying*(seed-0.5)*7.0);
    result=drop+result*(1.0-drop.a);
  }
  return result;
}
half4 main(float2 p) {
  float ignition=smoothstep(0.0,5.0,time);
  if(ignition<=0.0) return half4(0);
  float x=p.x-128.0, h=190.0-p.y;
  float edge=smoothstep(-18.0,12.0,x)*(1.0-smoothstep(fireWidth-12.0,fireWidth+18.0,x));
  float3 color=float3(0);
  float alpha=0.0;
  if(drops<0.5 && p.y<184.0+barHeight+25.0) {
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
  if(drops>0.5) {
    float sourceY=184.0+barHeight*0.5;
    float dripLane=floor(x/92.0);
    for(int neighbor=-2;neighbor<=2;neighbor++) {
      float id=dripLane+float(neighbor);
      float seed=hash(float2(id,83.0));
      float release=0.55+seed*0.25;
      float period=release+sqrt(max(1.0,floorY-sourceY-24.0)/510.0)+0.85;
      float local=time-0.6-fract(id*0.381966)*period;
      if(local<0.0) continue;
      float cycle=local/period;
      float age=mod(local,period);
      float variation=hash(float2(id,floor(cycle)+57.0));
      float origin=(id+0.25+seed*0.5)*92.0;
      if(origin<8.0 || origin>fireWidth-8.0) continue;
      float growth=smoothstep(0.0,release,age);
      float size=42.0+63.0*variation*variation;
      float detached=max(age-release,0.0);
      float startY=sourceY;
      float ground=floorY-floor(cycle)*20.0;
      float impact=release+sqrt(max(1.0,ground-size*0.4-startY)/510.0);
      if(age<impact) {
        float stretch=smoothstep(release*0.6,release,age)*(1.0-smoothstep(0.0,0.2,detached));
        float2 scale=size*max(0.15,growth)*float2(1.0-stretch*0.15,1.0+stretch*0.18);
        float2 center=float2(origin,startY+510.0*detached*detached);
        float4 drop=poop(float2(x,p.y),center,scale,sin(detached*4.0+seed*8.0)*detached*0.22);
        color=drop.rgb+color*(1.0-drop.a);
        alpha=drop.a+alpha*(1.0-drop.a);
      }
      for(int previous=0;previous<2;previous++) {
        float generation=floor(cycle)-float(previous);
        if(generation<0.0) continue;
        float4 flying=splash(float2(x,p.y),id,generation,local,period,origin,release,sourceY,false);
        color=flying.rgb+color*(1.0-flying.a);
        alpha=flying.a+alpha*(1.0-flying.a);
      }
      // Each impact deposits a permanent row; only nearby rows can cover this fragment.
      float row=floor((floorY-p.y)/20.0);
      for(int nearby=-2;nearby<=2;nearby++) {
        float generation=row+float(nearby);
        if(generation<0.0 || generation>floor(cycle)) continue;
        float4 landed=splash(float2(x,p.y),id,generation,local,period,origin,release,sourceY,true);
        color=landed.rgb+color*(1.0-landed.a);
        alpha=landed.a+alpha*(1.0-landed.a);
      }
    }
  }
  float bounds=smoothstep(0.0,14.0,p.y);
  alpha=clamp(alpha,0.0,1.0)*bounds;
  return half4(min(color*bounds,float3(alpha)),alpha);
}`;
let effect: NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>;
function fireEffect() {
  if (!effect) {
    effect = Skia.RuntimeEffect.Make(spriteFireShader)!;
    if (!effect) throw new Error("Could not compile sprite fire");
  }
  return effect;
}
export function FallingSprites({ width, barHeight, x, y, sprite, accessibilityLabel }: { width: number; barHeight: number; x: number; y: number; sprite: string; accessibilityLabel?: string }) {
  const surface = useContext(FocusSurfaceContext)?.surface;
  const ref = useRef<View>(null);
  const poopImage = useImage(sprite);
  const [floorY, setFloorY] = useState(1056);
  const uniforms = useAnimatedShaderUniforms({ fireWidth: width, barHeight, floorY, drops: 1 }, 5.4, { clock: "step" });
  const measureFloor = () => {
    if (surface?.root) ref.current?.measureLayout(surface.root, (_left, top) => {
      if (surface.height > 0) setFloorY(surface.height - top - 24);
    });
  };
  return <View ref={ref} collapsable={false} onLayout={measureFloor} pointerEvents="none"
    style={{ position: "absolute", zIndex: 1, left: x - 128, top: y - 184, width: width + 256, height: 184 + barHeight }}>
    {poopImage && <Canvas pointerEvents="none" accessibilityLabel={accessibilityLabel}
      style={{ position: "absolute", left: 0, top: 0, width: width + 256, height: floorY + 24 }}>
      <Fill><Shader source={fireEffect()} uniforms={uniforms}>
        <ImageShader image={poopImage} fit="contain" rect={{ x: 0, y: 0, width: 256, height: 256 }} tx="clamp" ty="clamp" />
      </Shader></Fill>
    </Canvas>}
  </View>;
}

export const flameSource = spriteFireShader
  .slice(0, spriteFireShader.indexOf("float4 poop("))
  .replace("uniform shader poopImage;", "") + spriteFireShader.slice(spriteFireShader.indexOf("half4 main("), spriteFireShader.indexOf("  if(drops>0.5)")) + spriteFireShader.slice(spriteFireShader.indexOf("  float bounds="));
let flameEffect: NonNullable<ReturnType<typeof Skia.RuntimeEffect.Make>>;
export function Flames({ width, barHeight, x, y, accessibilityLabel }: { width: number; barHeight: number; x: number; y: number; accessibilityLabel?: string }) {
  if (!flameEffect) {
    flameEffect = Skia.RuntimeEffect.Make(flameSource)!;
    if (!flameEffect) throw new Error("Could not compile upward flames");
  }
  const uniforms = useAnimatedShaderUniforms({ fireWidth: width, barHeight, floorY: 0, drops: 0 }, 5.4, { clock: "step" });
  return <View pointerEvents="none" style={{ position: "absolute", zIndex: 0, left: x - 128, top: y - 184, width: width + 256, height: 184 + barHeight }}>
    <Canvas pointerEvents="none" accessibilityLabel={accessibilityLabel} style={{ position: "absolute", left: 0, top: 0, width: width + 256, height: 184 + barHeight + 25 }}>
      <Fill><Shader source={flameEffect} uniforms={uniforms} /></Fill>
    </Canvas>
  </View>;
}
