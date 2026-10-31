import type { Vec3 } from "./camera";

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
${depthCode()}
@fragment fn fog(@location(0) uv:vec2f)->@location(0) vec4f {
 let distance=depthAt(uv); let world=vector(0u)+worldRay(uv)*distance;
 let heightDensity=exp(clamp(-(world.y-uniforms[13])*uniforms[14],-8.,8.));
 let fogAmount=1.-exp(-distance*uniforms[12]*heightDensity);
 var color=mix(textureSampleLevel(source,linearSampler,uv,0.).rgb,vector(20u),clamp(fogAmount,0.,1.));
 ${shafts ? "color+=shaftAt(uv);" : ""}
 return vec4f(color,1.);
}`;
}
export function dofCode(bindings: string, samples: number) {
  const common = `${bindings}
@group(0) @binding(3) var source:texture_2d<f32>;
@group(0) @binding(4) var depth:texture_depth_2d;
${depthCode()}
fn coc(z:f32)->f32 { return clamp(abs(z-uniforms[32])/max(z,.05)*uniforms[33],0.,1.); }
`;
  return {
    gather: `${common}
@fragment fn gather(@location(0) uv:vec2f)->@location(0) vec4f {
 let centerDepth=depthAt(uv); let radius=coc(centerDepth)*uniforms[34]*uniforms[35];
 let pixel=1./vec2f(textureDimensions(depth)); var color=vec3f(0.); var weight=0.;
 for(var i=0u;i<${samples}u;i++) {
  let angle=f32(i)*2.39996323; let disk=sqrt((f32(i)+.5)/${samples}.);
  let sampleUV=uv+vec2f(cos(angle),sin(angle))*disk*radius*pixel;
  let sampleDepth=depthAt(sampleUV); let sampleCoc=coc(sampleDepth);
  // Reject distant background crossing a nearer silhouette; let foreground bokeh spread.
  let foreground=sampleDepth<=centerDepth+.1;
  let contribution=select(exp(-abs(sampleDepth-centerDepth)/max(.1,centerDepth*.025)),1.,foreground);
  let w=contribution*max(.05,sampleCoc); color+=textureSampleLevel(source,linearSampler,sampleUV,0.).rgb*w; weight+=w;
 }
 return vec4f(color/max(weight,.0001),1.);
}`,
    composite: `${common}
@group(0) @binding(5) var blurred:texture_2d<f32>;
@fragment fn focusComposite(@location(0) uv:vec2f)->@location(0) vec4f {
 let amount=smoothstep(0.,.15,coc(depthAt(uv)));
 return vec4f(mix(textureSampleLevel(source,linearSampler,uv,0.).rgb,textureSampleLevel(blurred,linearSampler,uv,0.).rgb,amount),1.);
}`,
  };
}
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
 return customPass(uv,textureSampleLevel(previous,linearSampler,uv,0.),PassContext(frame.time,frame.slideTime,frame.stepTime,frame.step,depthAt(uv)));
}`;
}
export function finalCode(bindings: string) {
  return `${bindings}
@group(0) @binding(3) var source:texture_2d<f32>;
fn aces(x:vec3f)->vec3f { return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0.),vec3f(1.)); }
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
 let shift=(uv-.5)*uniforms[44];
 var color=vec3f(textureSampleLevel(source,linearSampler,uv+shift,0.).r,textureSampleLevel(source,linearSampler,uv,0.).g,textureSampleLevel(source,linearSampler,uv-shift,0.).b);
 color=srgb(aces(color*uniforms[8]*frame.brightness));
 color*=1.-uniforms[15]*smoothstep(.1,.8,length(uv-.5)); color*=1.-uniforms[17]*.65;
 let noise=fract(sin(dot(pixel.xy,vec2f(12.9898,78.233))+floor(frame.time*24.))*43758.5453)-.5;
 color+=noise*uniforms[16];
 if(uniforms[53]>.5) {
  let value=floor(clamp(uniforms[56],0.,999999.)); var digits=1.; var remaining=u32(value);
  for(var place=0u;place<5u;place++) { if(remaining>=10u) { digits+=1.; remaining/=10u; } }
  let height=max(.005,uniforms[59]); let width=height*.55/frame.aspect; let p=(uv-vec2f(uniforms[57],uniforms[58]))/vec2f(width,height);
  var amount=0.;
  for(var i=0u;i<6u;i++) { if(f32(i)<digits) { let divisor=pow(10.,digits-f32(i)-1.); let n=u32(floor(value/divisor))%10u; amount=max(amount,digit(p-vec2f(f32(i)*1.15,0.),n)); } }
  color=mix(color,srgb(vector(60u)),amount);
 }
 return vec4f(clamp(color,vec3f(0.),vec3f(1.)),1.);
}`;
}
