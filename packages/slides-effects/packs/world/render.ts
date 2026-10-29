import type { GPUPass, GPURenderGraphDefinition } from "@legend-apps/presentation";
import { worldHeaderSize, worldInstanceSize, type PreparedWorldScene, type PrimitiveKind, type WorldScene } from "./scene";
import type { Vec3 } from "./camera";

export const worldBindings = `
struct Frame { time:f32, dt:f32, frame:f32, step:f32, aspect:f32, brightness:f32, slideTime:f32, stepTime:f32 }
@group(0) @binding(0) var<uniform> frame:Frame;
@group(0) @binding(1) var<storage,read> uniforms:array<f32>;
@group(0) @binding(2) var linearSampler:sampler;
fn vector(i:u32)->vec3f { return vec3f(uniforms[i],uniforms[i+1u],uniforms[i+2u]); }
fn cameraForward()->vec3f { return normalize(vector(4u)-vector(0u)); }
fn cameraRight()->vec3f {
 let forward=cameraForward();
 let axis=select(vec3f(0.,1.,0.),vec3f(0.,0.,1.),abs(forward.y)>.99);
 let right=normalize(cross(forward,axis)); let up=cross(right,forward);
 return right*cos(uniforms[7])+up*sin(uniforms[7]);
}
fn cameraUp()->vec3f { return cross(cameraRight(),cameraForward()); }
fn project(p:vec3f)->vec4f {
 let delta=p-vector(0u); let z=dot(delta,cameraForward()); let near=.05; let far=500.;
 return vec4f(dot(delta,cameraRight())/(uniforms[3]*frame.aspect),dot(delta,cameraUp())/uniforms[3],far/(far-near)*z-far*near/(far-near),z);
}
`;
const triangleCorner = `
fn corner(id:u32)->vec2f {
 let corners=array<vec2f,6>(vec2f(0.,0.),vec2f(1.,0.),vec2f(0.,1.),vec2f(0.,1.),vec2f(1.,0.),vec2f(1.,1.));
 return corners[id%6u];
}
`;
const mesh: Record<PrimitiveKind, { count: number; code: string }> = {
  sphere: { count: 12 * 8 * 6, code: `
  let cell=vid/6u; let uv=(vec2f(f32(cell%12u),f32(cell/12u))+corner(vid))/vec2f(12.,8.);
  let longitude=uv.x*6.2831853; let latitude=uv.y*3.14159265;
  normal=vec3f(sin(latitude)*cos(longitude),cos(latitude),sin(latitude)*sin(longitude));
  point=normal*radius;
` },
  box: { count: 36, code: `
  let face=vid/6u; let uv=corner(vid)*2.-1.;
  if(face==0u) { normal=vec3f(1.,0.,0.); point=vec3f(1.,uv.y,uv.x); }
  if(face==1u) { normal=vec3f(-1.,0.,0.); point=vec3f(-1.,uv.y,-uv.x); }
  if(face==2u) { normal=vec3f(0.,1.,0.); point=vec3f(uv.x,1.,uv.y); }
  if(face==3u) { normal=vec3f(0.,-1.,0.); point=vec3f(uv.x,-1.,-uv.y); }
  if(face==4u) { normal=vec3f(0.,0.,1.); point=vec3f(uv.x,uv.y,1.); }
  if(face==5u) { normal=vec3f(0.,0.,-1.); point=vec3f(-uv.x,uv.y,-1.); }
  point*=radius;
` },
  tube: { count: 12 * 6 * 6, code: `
  let cell=vid/6u; let uv=(vec2f(f32(cell%12u),f32(cell/12u))+corner(vid))/vec2f(12.,6.);
  let endpoint=vector(base+12u)-origin;
  let control=endpoint*.5+vec3f(0.,length(endpoint)*uniforms[base+15u],0.);
  let t=uv.x; let tangent=normalize(2.*(1.-t)*control+2.*t*(endpoint-control));
  let axis=select(vec3f(0.,1.,0.),vec3f(1.,0.,0.),abs(tangent.y)>.95);
  let right=normalize(cross(tangent,axis)); let up=cross(right,tangent);
  normal=right*cos(uv.y*6.2831853)+up*sin(uv.y*6.2831853);
  point=2.*(1.-t)*t*control+t*t*endpoint+normal*uniforms[base+19u];
` },
  ring: { count: 32 * 6 * 6, code: `
  let cell=vid/6u; let uv=(vec2f(f32(cell%32u),f32(cell/32u))+corner(vid))/vec2f(32.,6.);
  let a=uv.x*6.2831853; let b=uv.y*6.2831853; let radial=vec3f(cos(a),0.,sin(a));
  normal=radial*cos(b)+vec3f(0.,sin(b),0.);
  point=radial*radius+normal*uniforms[base+19u];
` },
};

function geometryCode(kind: PrimitiveKind, offset: number) {
  return `${worldBindings}${triangleCorner}
struct Vertex { @builtin(position) position:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f, @location(2) color:vec3f, @location(3) emissive:f32 }
@vertex fn worldVertex(@builtin(vertex_index) vid:u32,@builtin(instance_index) iid:u32)->Vertex {
 let base=${worldHeaderSize}u+(iid+${offset}u)*${worldInstanceSize}u;
 let origin=vector(base); let radius=uniforms[base+3u];
 var point=vec3f(0.); var normal=vec3f(0.,1.,0.);
 ${mesh[kind].code}
 let scale=max(vector(base+8u),vec3f(.0001));
 let world=origin+point*scale;
 var result:Vertex; result.position=project(world); result.world=world; result.normal=normalize(normal/scale);
 result.color=vector(base+4u); result.emissive=uniforms[base+7u]; return result;
}
@fragment fn worldFragment(in:Vertex)->@location(0) vec4f {
 let normal=normalize(in.normal); let view=normalize(vector(0u)-in.world);
 let diffuse=max(0.,dot(normal,normalize(vec3f(-.4,1.,.6))));
 let rim=pow(1.-abs(dot(normal,view)),3.);
 let color=in.color*(.12+diffuse*.55+in.emissive)+in.color*rim*(.25+in.emissive*.12);
 return vec4f(color,1.);
}`;
}

const filterCode = `${worldBindings}
@group(0) @binding(3) var source:texture_2d<f32>;
fn tentFilter(uv:vec2f)->vec3f {
 let pixel=1./vec2f(textureDimensions(source));
 return textureSampleLevel(source,linearSampler,uv,0.).rgb*.25
  +(textureSampleLevel(source,linearSampler,uv+pixel*vec2f(-1.,-1.),0.).rgb
   +textureSampleLevel(source,linearSampler,uv+pixel*vec2f(1.,-1.),0.).rgb
   +textureSampleLevel(source,linearSampler,uv+pixel*vec2f(-1.,1.),0.).rgb
   +textureSampleLevel(source,linearSampler,uv+pixel*vec2f(1.,1.),0.).rgb)*.1875;
}
`;
const downsample = `${filterCode}
@fragment fn downsample(@location(0) uv:vec2f)->@location(0) vec4f { return vec4f(tentFilter(uv),1.); }
`;
const threshold = `${filterCode}
@fragment fn threshold(@location(0) uv:vec2f)->@location(0) vec4f {
 let color=tentFilter(uv); let brightness=max(color.r,max(color.g,color.b));
 let contribution=max(0.,brightness-uniforms[10])/max(.0001,brightness);
 return vec4f(color*contribution,1.);
}`;
const upsample = `${filterCode}
@group(0) @binding(4) var high:texture_2d<f32>;
@fragment fn upsample(@location(0) uv:vec2f)->@location(0) vec4f {
 let color=textureSampleLevel(high,linearSampler,uv,0.).rgb;
 return vec4f(color+tentFilter(uv)*uniforms[11],1.);
}`;
const finalCode = `${worldBindings}
@group(0) @binding(3) var hdr:texture_2d<f32>;
@group(0) @binding(4) var depth:texture_depth_2d;
@group(0) @binding(5) var bloom:texture_2d<f32>;
fn aces(x:vec3f)->vec3f { return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),vec3f(0.),vec3f(1.)); }
fn srgb(x:vec3f)->vec3f { return select(x*12.92,1.055*pow(x,vec3f(1./2.4))-.055,x>vec3f(.0031308)); }
@fragment fn tonemap(@location(0) uv:vec2f)->@location(0) vec4f {
 let pixel=clamp(vec2i(uv*vec2f(textureDimensions(depth))),vec2i(0),vec2i(textureDimensions(depth))-vec2i(1));
 let z=textureLoad(depth,pixel,0); let near=.05; let far=500.;
 let distance=near*far/(far-z*(far-near));
 let ray=cameraForward()+cameraRight()*(uv.x*2.-1.)*frame.aspect*uniforms[3]+cameraUp()*(1.-uv.y*2.)*uniforms[3];
 let world=vector(0u)+ray*distance;
 let heightDensity=exp(clamp(-(world.y-uniforms[13])*uniforms[14],-8.,8.));
 let fog=1.-exp(-distance*uniforms[12]*heightDensity);
 var color=mix(textureSampleLevel(hdr,linearSampler,uv,0.).rgb,vector(20u),clamp(fog,0.,1.));
 color+=textureSampleLevel(bloom,linearSampler,uv,0.).rgb*uniforms[9];
 color=srgb(aces(color*uniforms[8]*frame.brightness));
 let vignette=1.-uniforms[15]*smoothstep(.1,.8,length(uv-.5));
 color*=vignette*(1.-uniforms[17]*.65);
 let noise=fract(sin(dot(uv*vec2f(textureDimensions(hdr)),vec2f(12.9898,78.233))+floor(frame.time*24.))*43758.5453)-.5;
 color+=noise*uniforms[16];
 return vec4f(clamp(color,vec3f(0.),vec3f(1.)),1.);
}`;

export type WorldGraphTopology = { quality: WorldScene["quality"]; counts: Record<PrimitiveKind, number>; backgroundVector: Vec3 };
export function worldGraphTopology(scene: PreparedWorldScene): WorldGraphTopology {
  const counts: Record<PrimitiveKind, number> = { box: 0, ring: 0, sphere: 0, tube: 0 };
  for (const instance of scene.instances) counts[instance.kind]++;
  return { quality: scene.quality, counts, backgroundVector: scene.backgroundVector };
}
/** Pure graph description, shared by decks and the browser performance harness. */
export function buildWorldGraph(scene: PreparedWorldScene | WorldGraphTopology): GPURenderGraphDefinition & { uniformsSize: number } {
  const topology = "instances" in scene ? worldGraphTopology(scene) : scene;
  const scale = topology.quality === "low" ? 0.65 : topology.quality === "medium" ? 0.85 : 1;
  const levels = topology.quality === "low" ? 3 : 5;
  const instanceCount = Object.values(topology.counts).reduce((a, b) => a + b, 0);
  const passes: GPUPass[] = [];
  let offset = 0;
  const background = topology.backgroundVector;
  for (const kind of ["box", "ring", "sphere", "tube"] as const) {
    const count = topology.counts[kind];
    if (count || passes.length === 0 && instanceCount === 0) {
      passes.push({ kind: "render", id: `scene-${kind}`, code: geometryCode(kind, offset), vertex: "worldVertex", fragment: "worldFragment",
        color: ["hdr"], depth: "depth", vertexCount: mesh[kind].count, instanceCount: count,
        clear: passes.length === 0 ? [background[0], background[1], background[2], 1] : false });
    }
    offset += count;
  }
  passes.push({ kind: "fullscreen", id: "bloom-threshold", code: threshold, fragment: "threshold", reads: ["hdr"], output: "bloom@0" });
  for (let mip = 1; mip < levels; mip++) passes.push({ kind: "fullscreen", id: `bloom-down-${mip}`, code: downsample, fragment: "downsample", reads: [`bloom@${mip - 1}`], output: `bloom@${mip}` });
  passes.push({ kind: "fullscreen", id: `bloom-up-${levels - 1}`, code: downsample, fragment: "downsample", reads: [`bloom@${levels - 1}`], output: `bloom-up@${levels - 1}` });
  for (let mip = levels - 2; mip >= 0; mip--) passes.push({ kind: "fullscreen", id: `bloom-up-${mip}`, code: upsample, fragment: "upsample", reads: [`bloom-up@${mip + 1}`, `bloom@${mip}`], output: `bloom-up@${mip}` });
  passes.push({ kind: "fullscreen", id: "tonemap", code: finalCode, fragment: "tonemap", reads: ["hdr", "depth", "bloom-up@0"], output: "screen" });
  return { targets: [{ id: "hdr", format: "rgba16float", scale }, { id: "depth", format: "depth32float", scale },
    { id: "bloom", format: "rgba16float", scale: scale * 0.5, mips: levels }, { id: "bloom-up", format: "rgba16float", scale: scale * 0.5, mips: levels }],
    passes, uniformsSize: worldHeaderSize + instanceCount * worldInstanceSize };
}
