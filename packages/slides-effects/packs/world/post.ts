import { travelSpeedSlot, worldClockOffset, type WorldScene } from "./scene";
import type { Vec3 } from "./camera";
import { d } from "typegpu";
import { defineWorldEffect, type WorldEffectGraph } from "./effects";

export type CustomGeometry = { wgsl: string; vertexCount: number };
export type SDFGeometry = { wgsl: string; bounds: [Vec3, Vec3]; steps?: number };
export type WorldPostPass = { id?: string; wgsl: string; before?: string; after?: string; reads?: string[] };

export function depthCode() {
  return `
fn linearDepth(z:f32)->f32 { return .05*500./(500.-z*(500.-.05)); }
fn depthAt(uv:vec2f)->f32 {
 let pixel=clamp(vec2i(uv*vec2f(textureDimensions(depth))),vec2i(0),vec2i(textureDimensions(depth))-vec2i(1));
 return linearDepth(textureLoad(depth,pixel,0));
}
fn worldRay(uv:vec2f)->vec3f { return cameraForward()+cameraRight()*(uv.x*2.-1.)*frame.aspect*uniforms[3]+cameraUp()*(1.-uv.y*2.)*uniforms[3]; }
`;
}
export function shaftCode(bindings: string, lights: number, steps: number) {
  return `${bindings}
@group(0) @binding(3) var depth:texture_depth_2d;
${depthCode()}
@fragment fn shafts(@location(0) uv:vec2f,@builtin(position) position:vec4f)->@location(0) vec4f {
 let ray=worldRay(uv); let direction=normalize(ray);
 let distance=min(depthAt(uv),100.); let stride=distance/${steps}.; let segment=stride*length(ray);
 let density=max(uniforms[46],.0001); let anisotropy=clamp(uniforms[47],-.8,.8);
 // Interleaved gradient noise spreads the step offsets evenly, so fog's 3x3 tent removes the banding without white-noise grain.
 let jitter=fract(52.9829189*fract(dot(floor(position.xy),vec2f(.06711056,.00583715))));
 var scattering=vec3f(0.); var opticalDepth=0.;
 for(var sampleIndex=0u;sampleIndex<${steps}u;sampleIndex++) {
  let z=(f32(sampleIndex)+jitter)*stride; let world=vector(0u)+ray*z;
  let localDensity=density*exp(clamp(-(world.y-uniforms[13])*uniforms[14],-8.,8.));
  let transmission=exp(-opticalDepth); opticalDepth+=localDensity*segment;
  for(var light=0u;light<${lights}u;light++) {
   let base=64u+light*12u; let delta=vector(base)-world; let lightDistance=max(length(delta),.001);
   let toward=delta/lightDistance; let radius=max(uniforms[base+7u],.001);
   let attenuation=pow(max(0.,1.-lightDistance/radius),2.)/(1.+lightDistance*lightDistance*.06);
   var cone=1.; let cosine=uniforms[base+11u];
   if(cosine>-.99) { cone=smoothstep(cosine,min(.9999,cosine+.08),dot(-toward,normalize(vector(base+8u)))); }
   let angle=dot(direction,toward); let falloff=max(.01,1.+anisotropy*anisotropy-2.*anisotropy*angle); let phase=(1.-anisotropy*anisotropy)/(falloff*sqrt(falloff));
   scattering+=vector(base+4u)*uniforms[base+3u]*attenuation*cone*phase*transmission*localDensity*segment;
  }
 }
 return vec4f(scattering*uniforms[45],1.);
}`;
}
const heightFog = `
fn fogged(color:vec3f,uv:vec2f,distance:f32)->vec3f {
 let world=vector(0u)+worldRay(uv)*distance;
 let heightDensity=exp(clamp(-(world.y-uniforms[13])*uniforms[14],-8.,8.));
 let fogAmount=1.-exp(-distance*uniforms[12]*heightDensity);
 return mix(color,vector(20u),clamp(fogAmount,0.,1.));
}`;
export function fogCode(bindings: string, shafts: boolean) {
  return `${bindings}
@group(0) @binding(3) var source:texture_2d<f32>;
@group(0) @binding(4) var depth:texture_depth_2d;
${shafts ? `@group(0) @binding(5) var shaftField:texture_2d<f32>;
// The 3x3 tent as four bilinear taps at half-texel offsets.
fn shaftAt(uv:vec2f)->vec3f {
 let texel=.5/vec2f(textureDimensions(shaftField)); var sum=vec3f(0.);
 for(var i=0;i<4;i++) { sum+=textureSampleLevel(shaftField,linearSampler,uv+vec2f(f32(i&1)*2.-1.,f32(i>>1u)*2.-1.)*texel,0.).rgb; }
 return sum*.25;
}` : ""}
${depthCode()}${heightFog}
@fragment fn fog(@location(0) uv:vec2f)->@location(0) vec4f {
 var color=fogged(textureSampleLevel(source,linearSampler,uv,0.).rgb,uv,depthAt(uv));
 ${shafts ? "color+=shaftAt(uv);" : ""}
 return vec4f(color,1.);
}`;
}
/** Header slots the scene writes DOF values to; animated focus resolves object ids before sampling. */
export const dofSlots = { focus: 32, aperture: 33, maxBlur: 34, renderScale: 35, focusRange: 54 };
/** Half-resolution focus gather and a depth-aware composite. Option `fog` applies height fog to each tap instead of a separate full-resolution fog pass. */
export const dofEffect = defineWorldEffect<{ focus: d.F32; aperture: d.F32; maxBlur: d.F32; renderScale: d.F32; focusRange: d.F32 }, { samples?: number; scale?: number; fog?: boolean }>({
  name: "dof", params: { focus: d.f32, aperture: d.f32, maxBlur: d.f32, renderScale: d.f32, focusRange: d.f32 },
  defaults: { focus: 16, aperture: .6, maxBlur: 12, renderScale: 1, focusRange: 0 },
  build({ input, options, scale, samples, id }): WorldEffectGraph {
    const common = `${options.fog ? heightFog : "\nfn fogged(color:vec3f,uv:vec2f,distance:f32)->vec3f { return color; }"}
fn coc(z:f32)->f32 { let p=params(); return clamp(max(0.,abs(z-p.focus)-max(0.,p.focusRange))/max(z,.05)*p.aperture,0.,1.); }
`;
    return { targets: [{ id: id(), scale: scale * (options.scale ?? .5) }], passes: [{ id: id("gather"), fragment: "gather", reads: { source: input, depth: "depth" }, output: id(), wgsl: `${common}
@fragment fn gather(@location(0) uv:vec2f)->@location(0) vec4f {
 let centerDepth=depthAt(uv); let radius=coc(centerDepth)*params().maxBlur*params().renderScale;
 let pixel=1./vec2f(textureDimensions(depth)); var color=vec3f(0.); var weight=0.;
 // Every zero-radius tap is identical; retain the sum order to preserve rounding.
 if(radius==0.) {
  let w=max(.05,coc(centerDepth));
  let sample=fogged(textureSampleLevel(source,linearSampler,uv,0.).rgb,uv,centerDepth);
  for(var i=0u;i<${options.samples ?? samples}u;i++) { color+=sample*w; weight+=w; }
  return vec4f(color/max(weight,.0001),1.);
 }
 for(var i=0u;i<${options.samples ?? samples}u;i++) {
  let angle=f32(i)*2.39996323; let disk=sqrt((f32(i)+.5)/${options.samples ?? samples}.);
  let sampleUV=uv+vec2f(cos(angle),sin(angle))*disk*radius*pixel;
  let sampleDepth=depthAt(sampleUV); let sampleCoc=coc(sampleDepth);
  // Reject distant background crossing a nearer silhouette; let foreground bokeh spread.
  let foreground=sampleDepth<=centerDepth+.1;
  let contribution=select(exp(-abs(sampleDepth-centerDepth)/max(.1,centerDepth*.025)),1.,foreground);
  let w=contribution*max(.05,sampleCoc); color+=fogged(textureSampleLevel(source,linearSampler,sampleUV,0.).rgb,sampleUV,sampleDepth)*w; weight+=w;
 }
 return vec4f(color/max(weight,.0001),1.);
}` }, { id: id("composite"), fragment: "focusComposite", reads: { source: input, depth: "depth", blurred: id() }, output: id("composite"), wgsl: `${common}
@fragment fn focusComposite(@location(0) uv:vec2f)->@location(0) vec4f {
 let distance=depthAt(uv); let amount=smoothstep(0.,.15,coc(distance));
 return vec4f(mix(fogged(textureSampleLevel(source,linearSampler,uv,0.).rgb,uv,distance),textureSampleLevel(blurred,linearSampler,uv,0.).rgb,amount),1.);
}` }] };
  },
});
export function customPostCode(bindings: string, wgsl: string) {
  return `${bindings}
@group(0) @binding(3) var previous:texture_2d<f32>;
@group(0) @binding(4) var depth:texture_depth_2d;
@group(0) @binding(5) var sceneHDR:texture_2d<f32>;
${depthCode()}
struct PassContext { time:f32, slideTime:f32, stepTime:f32, step:f32, depth:f32 }
fn sampleHDR(uv:vec2f)->vec4f { return textureSampleLevel(sceneHDR,linearSampler,uv,0.); }
fn sampleDepth(uv:vec2f)->f32 { return depthAt(uv); }
${wgsl}
@fragment fn customPost(@location(0) uv:vec2f)->@location(0) vec4f {
 return customPass(uv,textureSampleLevel(previous,linearSampler,uv,0.),PassContext(uniforms[${worldClockOffset}],uniforms[${worldClockOffset}],uniforms[${worldClockOffset + 1}],uniforms[${worldClockOffset + 2}],depthAt(uv)));
}`;
}
// Linear-sRGB operators adapted from three.js r180, Copyright (c) 2010-2025 three.js authors (MIT).
// The legacy ACES fit keeps existing decks unchanged.
function toneMappingCode(mode: NonNullable<WorldScene["toneMapping"]>) {
  if (mode === "neutral") return `
fn toneMap(input:vec3f)->vec3f {
 var color=input; let x=min(color.r,min(color.g,color.b));
 let offset=select(.04,x-6.25*x*x,x<.08); color-=offset;
 let peak=max(color.r,max(color.g,color.b)); if(peak<.76) { return color; }
 let newPeak=1.-.24*.24/(peak+.24-.76); color*=newPeak/peak;
 let g=1.-1./(.15*(peak-newPeak)+1.); return mix(color,vec3f(newPeak),g);
}`;
  if (mode === "aces-filmic") return `
fn toneMap(input:vec3f)->vec3f {
 let inMat=mat3x3f(vec3f(.59719,.07600,.02840),vec3f(.35458,.90834,.13383),vec3f(.04823,.01566,.83777));
 let outMat=mat3x3f(vec3f(1.60475,-.10208,-.00327),vec3f(-.53108,1.10813,-.07276),vec3f(-.07367,-.00605,1.07602));
 let v=inMat*(input/.6); let a=v*(v+.0245786)-.000090537; let b=v*(.983729*v+.4329510)+.238081;
 return clamp(outMat*(a/b),vec3f(0.),vec3f(1.));
}`;
  if (mode === "agx") return `
fn toneMap(input:vec3f)->vec3f {
 let to2020=mat3x3f(vec3f(.6274,.0691,.0164),vec3f(.3293,.9195,.0880),vec3f(.0433,.0113,.8956));
 let from2020=mat3x3f(vec3f(1.6605,-.1246,-.0182),vec3f(-.5876,1.1329,-.1006),vec3f(-.0728,-.0083,1.1187));
 let inset=mat3x3f(vec3f(.8566271533,.1373189729,.1118982130),vec3f(.0951212405,.7612419906,.0767994186),vec3f(.0482516061,.1014390365,.8113023684));
 let outset=mat3x3f(vec3f(1.1271005818,-.1413297635,-.1413297635),vec3f(-.1106066431,1.1578237022,-.1106066431),vec3f(-.0164939387,-.0164939387,1.2519364066));
 let x=clamp((log2(max(inset*(to2020*input),vec3f(1e-10)))+12.47393)/16.499999,vec3f(0.),vec3f(1.));
 let x2=x*x; let x4=x2*x2;
 let contrast=15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232;
 return clamp(from2020*pow(max(outset*contrast,vec3f(0.)),vec3f(2.2)),vec3f(0.),vec3f(1.));
}`;
  return `fn toneMap(x:vec3f)->vec3f { return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0.),vec3f(1.)); }`;
}

/** `bloomGain` is the WGSL gain of a fused additive effect bound as `bloom`. */
export function finalCode(bindings: string, toneMapping: WorldScene["toneMapping"] = "aces", outputColorSpace: WorldScene["outputColorSpace"] = "srgb", bloomGain?: string) {
  return `${bindings}
@group(0) @binding(3) var source:texture_2d<f32>;
${bloomGain ? "@group(0) @binding(4) var bloom:texture_2d<f32>;" : ""}
fn sceneAt(uv:vec2f)->vec3f { return textureSampleLevel(source,linearSampler,uv,0.).rgb${bloomGain ? `+textureSampleLevel(bloom,linearSampler,uv,0.).rgb*${bloomGain}` : ""}; }
${toneMappingCode(toneMapping)}
fn srgb(x:vec3f)->vec3f { return select(x*12.92,1.055*pow(x,vec3f(1./2.4))-.055,x>vec3f(.0031308)); }
fn rectangle(p:vec2f,center:vec2f,halfSize:vec2f)->f32 { let q=abs(p-center)-halfSize; return length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.); }
fn digit(p:vec2f,value:u32)->f32 {
 let masks=array<u32,10>(119u,36u,93u,109u,46u,107u,123u,37u,127u,111u); let mask=masks[min(value,9u)];
 var distance=100.;
 if((mask&1u)!=0u) { distance=min(distance,rectangle(p,vec2f(.5,.08),vec2f(.32,.055))); }
 if((mask&2u)!=0u) { distance=min(distance,rectangle(p,vec2f(.13,.28),vec2f(.055,.16))); }
 if((mask&4u)!=0u) { distance=min(distance,rectangle(p,vec2f(.87,.28),vec2f(.055,.16))); }
 if((mask&8u)!=0u) { distance=min(distance,rectangle(p,vec2f(.5,.5),vec2f(.32,.055))); }
 if((mask&16u)!=0u) { distance=min(distance,rectangle(p,vec2f(.13,.72),vec2f(.055,.16))); }
 if((mask&32u)!=0u) { distance=min(distance,rectangle(p,vec2f(.87,.72),vec2f(.055,.16))); }
 if((mask&64u)!=0u) { distance=min(distance,rectangle(p,vec2f(.5,.92),vec2f(.32,.055))); }
 return 1.-smoothstep(0.,.025,distance);
}
@fragment fn tonemap(@location(0) uv:vec2f,@builtin(position) pixel:vec4f)->@location(0) vec4f {
 let shift=(uv-.5)*uniforms[44]*${toneMapping === "aces" ? "1." : "-1."};
 var color=sceneAt(uv);
 if(uniforms[44]!=0.) { color=vec3f(sceneAt(uv+shift).r,color.g,sceneAt(uv-shift).b); }
 let blur=uniforms[${travelSpeedSlot + 1}];
 if(blur>.002) { let stride=(uv-.5)*blur*.012; for(var i=1;i<10;i++) { color+=sceneAt(uv-stride*f32(i)); } color*=.1; }
 let noise=fract(sin(dot(pixel.xy,vec2f(12.9898,78.233))+floor(uniforms[${worldClockOffset}]*24.))*43758.5453)-.5;
 ${toneMapping === "aces" ? `color=toneMap(color*uniforms[8]*frame.brightness);
 ${outputColorSpace === "srgb" ? "color=srgb(color);" : ""}
 color*=1.-uniforms[15]*smoothstep(.1,.8,length(uv-.5)); color*=1.-uniforms[17]*.65;
 color+=noise*uniforms[16];` : `color*=1.-uniforms[15]*smoothstep(.25,.85,length((uv-.5)*vec2f(1.1,1.)));
 color=max(vec3f(0.),color+noise*uniforms[16]*(.3+color));
 color=toneMap(color*uniforms[8]*frame.brightness);
 ${outputColorSpace === "srgb" ? "color=srgb(color);" : ""}
 color*=1.-uniforms[17]*.65;`}
 if(uniforms[53]>.5) {
  let value=floor(clamp(uniforms[56],0.,999999.)); var digits=1.; var remaining=u32(value);
  for(var place=0u;place<5u;place++) { if(remaining>=10u) { digits+=1.; remaining/=10u; } }
  let height=max(.005,uniforms[59]); let width=height*.55/frame.aspect; let p=(uv-vec2f(uniforms[57],uniforms[58]))/vec2f(width,height);
  var amount=0.;
  for(var i=0u;i<6u;i++) { if(f32(i)<digits) { let divisor=pow(10.,digits-f32(i)-1.); let n=u32(floor(value/divisor))%10u; amount=max(amount,digit(p-vec2f(f32(i)*1.15,0.),n)); } }
  color=mix(color,${outputColorSpace === "srgb" ? "srgb(vector(60u))" : "vector(60u)"},amount);
 }
 return vec4f(clamp(color,vec3f(0.),vec3f(1.)),1.);
}`;
}
