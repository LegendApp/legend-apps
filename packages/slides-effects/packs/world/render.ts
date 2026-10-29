import type { GPUPass, GPURenderGraphDefinition } from "@legend-apps/presentation";
import { worldHeaderSize, worldInstanceSize, type PreparedWorldScene, type PrimitiveKind, type WorldScene } from "./scene";
import type { Vec3 } from "./camera";
import { customPostCode, dofCode, finalCode, fogCode, shaftCode, type CustomGeometry, type SDFGeometry, type WorldPostPass } from "./post";

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

function lightingCode(lightCount: number, reflection: boolean) {
  return `
fn eye()->vec3f { let camera=vector(0u); return ${reflection ? "vec3f(camera.x,2.*uniforms[36]-camera.y,camera.z)" : "camera"}; }
fn projected(world:vec3f)->vec4f { return project(${reflection ? "vec3f(world.x,2.*uniforms[36]-world.y,world.z)" : "world"}); }
struct Material { albedo:vec3f, emissive:vec3f, roughness:f32, metal:f32 }
struct ShapeContext { time:f32, slideTime:f32, stepTime:f32, step:f32 }
struct ShapeVertex { position:vec3f, normal:vec3f }
fn shapeContext()->ShapeContext { return ShapeContext(frame.time,frame.slideTime,frame.stepTime,frame.step); }
fn illuminate(world:vec3f,normal:vec3f,material:Material,rimColor:vec3f,rimIntensity:f32,activation:f32)->vec3f {
 let view=normalize(eye()-world); var color=material.albedo*uniforms[52]+material.emissive;
 let roughness=clamp(material.roughness,.04,1.); let metal=clamp(material.metal,0.,1.);
 ${lightCount === 0 ? "color+=material.albedo*max(0.,dot(normal,normalize(vec3f(-.4,1.,.6))))*.55;" : ""}
 for(var light=0u;light<${lightCount}u;light++) {
  let base=64u+light*12u; let delta=vector(base)-world; let distance=max(length(delta),.001); let toward=delta/distance;
  let range=max(.001,uniforms[base+7u]); let attenuation=pow(max(0.,1.-distance/range),2.)/(1.+distance*distance*.06);
  var cone=1.; let cosine=uniforms[base+11u];
  if(cosine>-.99) { cone=smoothstep(cosine,min(.9999,cosine+.08),dot(-toward,normalize(vector(base+8u)))); }
  let halfVector=normalize(toward+view+vec3f(.00001));
  let specular=pow(max(0.,dot(normal,halfVector)),mix(128.,3.,roughness))*mix(1.,.12,roughness);
  let f0=mix(vec3f(.04),material.albedo,metal);
  let diffuse=material.albedo*max(0.,dot(normal,toward))*(1.-metal);
  color+=(diffuse+f0*specular)*vector(base+4u)*uniforms[base+3u]*attenuation*cone;
 }
 let rim=pow(1.-abs(dot(normal,view)),3.);
 return color+rim*(rimColor*rimIntensity+vector(48u)*uniforms[51]*activation);
}
`;
}
const vertexFields = `
struct WorldVertex { @builtin(position) position:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f,
 @location(2) color:vec3f, @location(3) emissive:f32, @location(4) material:vec4f, @location(5) albedo:vec3f,
 @location(6) opacity:f32, @location(7) @interpolate(flat) instance:u32 }
`;
function geometryCode(kind: PrimitiveKind, offset: number, lights: number, reflection: boolean, custom?: CustomGeometry, sdf?: SDFGeometry) {
  const shape = custom ? `let shapeVertex=shape(iid,vid,shapeContext()); point=shapeVertex.position*radius; normal=shapeVertex.normal;` : mesh[kind].code;
  const bounds = sdf ? sdf.bounds.map(v => `vec3f(${v.map(n => Number.isInteger(n) ? n + "." : n).join(",")})`) : [];
  return `${worldBindings}${triangleCorner}${lightingCode(lights, reflection)}${vertexFields}
${custom?.wgsl ?? sdf?.wgsl ?? ""}
@vertex fn worldVertex(@builtin(vertex_index) vid:u32,@builtin(instance_index) iid:u32)->WorldVertex {
 let base=${worldHeaderSize}u+(iid+${offset}u)*${worldInstanceSize}u;
 let origin=vector(base); let radius=max(uniforms[base+3u],.0001);
 var point=vec3f(0.); var normal=vec3f(0.,1.,0.);
 ${shape}
 ${sdf ? `point=mix(${bounds[0]},${bounds[1]},point/radius*.5+.5)*radius;` : ""}
 let scale=max(vector(base+8u),vec3f(.0001)); let world=origin+point*scale;
 var result:WorldVertex; result.position=projected(world); result.world=world; result.normal=normalize(normal/scale);
 result.color=vector(base+4u); result.emissive=uniforms[base+7u]; result.material=vec4f(uniforms[base+27u],uniforms[base+28u],uniforms[base+29u],uniforms[base+30u]);
 result.albedo=vector(base+24u); result.opacity=uniforms[base+23u]; result.instance=iid; return result;
}
${sdf ? `
struct SDFResult { @location(0) color:vec4f, @builtin(frag_depth) depth:f32 }
@fragment fn worldFragment(in:WorldVertex)->SDFResult {
 if(in.opacity<=.001) { discard; }
 let base=${worldHeaderSize}u+(in.instance+${offset}u)*${worldInstanceSize}u;
 let origin=vector(base); let scale=max(vector(base+8u)*uniforms[base+3u],vec3f(.0001));
 let rayOrigin=(eye()-origin)/scale; let rayDirection=normalize((in.world-eye())/scale);
 let direction=select(rayDirection,vec3f(.000001),abs(rayDirection)<vec3f(.000001));
 let a=(${bounds[0]}-rayOrigin)/direction; let b=(${bounds[1]}-rayOrigin)/direction;
 let lower=min(a,b); let upper=max(a,b); var distance=max(0.,max(lower.x,max(lower.y,lower.z))); let exitDistance=min(upper.x,min(upper.y,upper.z));
 var found=false; var local=vec3f(0.);
 for(var i=0u;i<${Math.max(1, Math.min(256, sdf.steps ?? 64))}u;i++) {
  if(distance>exitDistance) { break; } local=rayOrigin+rayDirection*distance; let field=sdf(local);
  if(abs(field)<.001) { found=true; break; } distance+=max(.0005,abs(field));
 }
 if(!found) { discard; }
 let hit=origin+local*scale;
 ${reflection ? "if(hit.y<uniforms[36]+.001) { discard; }" : ""}
 let e=.001; let normal=normalize(vec3f(sdf(local+vec3f(e,0.,0.))-sdf(local-vec3f(e,0.,0.)),sdf(local+vec3f(0.,e,0.))-sdf(local-vec3f(0.,e,0.)),sdf(local+vec3f(0.,0.,e))-sdf(local-vec3f(0.,0.,e)))/scale);
 let material=Material(in.albedo,in.color*in.emissive,in.material.x,in.material.y);
 let color=illuminate(hit,normal,material,in.color,in.material.z,in.material.w); let clip=projected(hit);
 return SDFResult(vec4f(color*in.opacity,in.opacity),clamp(clip.z/clip.w,0.,1.));
}` : `
@fragment fn worldFragment(in:WorldVertex)->@location(0) vec4f {
 if(in.opacity<=.001) { discard; }
 ${reflection ? "if(in.world.y<uniforms[36]+.001) { discard; }" : ""}
 let normal=normalize(in.normal);
 let material=${custom ? "shade(in.instance,in.world,normal,shapeContext())" : "Material(in.albedo,in.color*in.emissive,in.material.x,in.material.y)"};
 let color=illuminate(in.world,normal,material,in.color,in.material.z,in.material.w);
 return vec4f(color*in.opacity,in.opacity);
}`}`;
}
function floorCode(lights: number, mirror: boolean) {
  return `${worldBindings}${lightingCode(lights, false)}
${mirror ? "@group(0) @binding(3) var reflection:texture_2d<f32>;" : ""}
struct FloorVertex { @builtin(position) position:vec4f, @location(0) uv:vec2f }
@vertex fn floorVertex(@builtin(vertex_index) id:u32)->FloorVertex {
 let p=vec2f(f32((id<<1u)&2u),f32(id&2u)); return FloorVertex(vec4f(p*2.-1.,0.,1.),vec2f(p.x,1.-p.y));
}
struct FloorResult { @location(0) color:vec4f, @builtin(frag_depth) depth:f32 }
@fragment fn floorFragment(in:FloorVertex)->FloorResult {
 let ray=cameraForward()+cameraRight()*(in.uv.x*2.-1.)*frame.aspect*uniforms[3]+cameraUp()*(1.-in.uv.y*2.)*uniforms[3];
 if(abs(ray.y)<.0001) { discard; } let distance=(uniforms[36]-vector(0u).y)/ray.y;
 let world=vector(0u)+ray*distance;
 if(distance<=.05 || distance>=500. || abs(world.x)>uniforms[39] || abs(world.z)>uniforms[39]) { discard; }
 let normal=vec3f(0.,1.,0.); let view=normalize(vector(0u)-world); let material=Material(vector(40u),vec3f(0.),uniforms[37],uniforms[43]);
 var color=illuminate(world,normal,material,vec3f(0.),0.,1.);
 ${mirror ? `let spread=uniforms[37]*.025; let pixel=vec2f(spread,spread*frame.aspect);
 var reflected=textureSampleLevel(reflection,linearSampler,in.uv,0.).rgb*.4;
 reflected+=(textureSampleLevel(reflection,linearSampler,in.uv+pixel*vec2f(1.,0.),0.).rgb+textureSampleLevel(reflection,linearSampler,in.uv-pixel*vec2f(1.,0.),0.).rgb+textureSampleLevel(reflection,linearSampler,in.uv+pixel*vec2f(0.,1.),0.).rgb+textureSampleLevel(reflection,linearSampler,in.uv-pixel*vec2f(0.,1.),0.).rgb)*.15;
 let fresnel=.04+.96*pow(1.-clamp(dot(normal,view),0.,1.),5.);
 color=mix(color,reflected,clamp(uniforms[38]*mix(fresnel,1.,uniforms[43]),0.,1.));` : ""}
 let clip=project(world); return FloorResult(vec4f(color,1.),clamp(clip.z/clip.w,0.,1.));
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
@fragment fn downsample(@location(0) uv:vec2f)->@location(0) vec4f { return vec4f(tentFilter(uv),1.); }`;
const threshold = `${filterCode}
@fragment fn threshold(@location(0) uv:vec2f)->@location(0) vec4f {
 let color=tentFilter(uv); let brightness=max(color.r,max(color.g,color.b));
 return vec4f(color*max(0.,brightness-uniforms[10])/max(.0001,brightness),1.);
}`;
const upsample = `${filterCode}
@group(0) @binding(4) var high:texture_2d<f32>;
@fragment fn upsample(@location(0) uv:vec2f)->@location(0) vec4f { return vec4f(textureSampleLevel(high,linearSampler,uv,0.).rgb+tentFilter(uv)*uniforms[11],1.); }`;
const bloomComposite = `${worldBindings}
@group(0) @binding(3) var source:texture_2d<f32>;
@group(0) @binding(4) var bloom:texture_2d<f32>;
@fragment fn bloomComposite(@location(0) uv:vec2f)->@location(0) vec4f { return vec4f(textureSampleLevel(source,linearSampler,uv,0.).rgb+textureSampleLevel(bloom,linearSampler,uv,0.).rgb*uniforms[9],1.); }`;
const copyCode = `${worldBindings}
@group(0) @binding(3) var source:texture_2d<f32>;
@fragment fn copyColor(@location(0) uv:vec2f)->@location(0) vec4f { return textureSampleLevel(source,linearSampler,uv,0.); }`;

type CustomDraw = CustomGeometry & { offset: number; count: number };
type SDFDraw = SDFGeometry & { offset: number; count: number };
export type WorldGraphTopology = {
  quality: WorldScene["quality"]; counts: Record<PrimitiveKind, number>; backgroundVector: Vec3;
  floor?: boolean; mirror?: boolean; dof?: boolean; shafts?: boolean; lightCount?: number;
  dofScale?: number; dofSamples?: number; reflectionScale?: number; shaftScale?: number; shaftSamples?: number;
  customs?: CustomDraw[]; sdfs?: SDFDraw[]; passes?: WorldPostPass[]; postOrder?: string[];
};
export function worldGraphTopology(scene: PreparedWorldScene): WorldGraphTopology {
  const counts: Record<PrimitiveKind, number> = { box: 0, ring: 0, sphere: 0, tube: 0 };
  const customs: CustomDraw[] = [], sdfs: SDFDraw[] = [];
  let previousCustom: CustomGeometry | undefined, previousSDF: SDFGeometry | undefined;
  for (let offset = 0; offset < scene.instances.length; offset++) {
    const instance = scene.instances[offset];
    if (instance.custom) {
      const last = customs.at(-1);
      if (last && last.offset + last.count === offset && previousCustom === instance.custom) last.count++;
      else customs.push({ ...instance.custom, offset, count: 1 });
      previousCustom = instance.custom;
    } else if (instance.sdf) {
      const last = sdfs.at(-1);
      if (last && last.offset + last.count === offset && previousSDF === instance.sdf) last.count++;
      else sdfs.push({ ...instance.sdf, offset, count: 1 });
      previousSDF = instance.sdf;
    } else counts[instance.kind]++;
  }
  return { quality: scene.quality, counts, backgroundVector: scene.backgroundVector,
    floor: !!scene.floor, mirror: !!scene.floor?.mirror, dof: !!scene.dof, shafts: !!scene.shafts, lightCount: scene.lights?.length ?? 0,
    dofScale: scene.dof?.scale, dofSamples: scene.dof?.samples, reflectionScale: scene.floor?.scale, shaftScale: scene.shafts?.scale, shaftSamples: scene.shafts?.samples,
    customs, sdfs, passes: scene.passes, postOrder: scene.postOrder };
}
/** Pure topology: animated values travel only through the uniform snapshot. */
export function buildWorldGraph(scene: PreparedWorldScene | WorldGraphTopology): GPURenderGraphDefinition & { uniformsSize: number } {
  const topology = "instances" in scene ? worldGraphTopology(scene) : scene;
  const scale = topology.quality === "low" ? .65 : topology.quality === "medium" ? .85 : 1;
  const levels = topology.quality === "low" ? 3 : 5;
  const samples = topology.quality === "low" ? 8 : topology.quality === "medium" ? 12 : 16;
  const passes: GPUPass[] = [];
  const targets: GPURenderGraphDefinition["targets"] = [{ id: "hdr", format: "rgba16float", scale }, { id: "depth", format: "depth32float", scale },
    { id: "bloom", format: "rgba16float", scale: scale * .5, mips: levels }, { id: "bloom-up", format: "rgba16float", scale: scale * .5, mips: levels }];
  const background = topology.backgroundVector;
  const clear: [number, number, number, number] = [background[0], background[1], background[2], 1];
  const customDraws = topology.customs ?? [], sdfDraws = topology.sdfs ?? [];
  const lights = topology.lightCount ?? 0;
  const instanceCount = Object.values(topology.counts).reduce((a, b) => a + b, 0) + [...customDraws, ...sdfDraws].reduce((sum, draw) => sum + draw.count, 0);
  const renderScene = (reflection: boolean, cleared = false) => {
    const color = reflection ? "reflect" : "hdr", depth = reflection ? "reflectDepth" : "depth";
    let offset = 0, draws = 0;
    const add = (id: string, kind: PrimitiveKind, count: number, start: number, custom?: CustomGeometry, sdf?: SDFGeometry) => {
      passes.push({ kind: "render", id: `${reflection ? "reflection" : "scene"}-${id}`, code: geometryCode(kind, start, lights, reflection, custom, sdf), vertex: "worldVertex", fragment: "worldFragment",
        color: [color], depth, vertexCount: custom?.vertexCount ?? mesh[kind].count, instanceCount: count, blend: "over", clear: draws++ === 0 && !cleared ? clear : false });
    };
    for (const kind of ["box", "ring", "sphere", "tube"] as const) { if (topology.counts[kind]) add(kind, kind, topology.counts[kind], offset); offset += topology.counts[kind]; }
    for (const [index, draw] of customDraws.entries()) add(`custom-${index}`, "box", draw.count, draw.offset, draw);
    for (const [index, draw] of sdfDraws.entries()) add(`sdf-${index}`, "box", draw.count, draw.offset, undefined, draw);
    if (!draws && !cleared) add("empty", "box", 0, 0);
  };
  if (topology.mirror) {
    const reflectionScale = scale * (topology.reflectionScale ?? .5);
    targets.push({ id: "reflect", format: "rgba16float", scale: reflectionScale }, { id: "reflectDepth", format: "depth32float", scale: reflectionScale });
    renderScene(true);
  }
  if (topology.floor) passes.push({ kind: "render", id: "floor", code: floorCode(lights, !!topology.mirror), vertex: "floorVertex", fragment: "floorFragment", color: ["hdr"], depth: "depth", vertexCount: 3, clear, reads: topology.mirror ? ["reflect"] : [] });
  renderScene(false, !!topology.floor);
  if (topology.shafts) {
    targets.push({ id: "shafts", format: "rgba16float", scale: scale * (topology.shaftScale ?? .25) });
    passes.push({ kind: "fullscreen", id: "shafts", code: shaftCode(worldBindings, lights, topology.shaftSamples ?? samples), fragment: "shafts", reads: ["depth"], output: "shafts" });
  }
  let color = "hdr", customIndex = 0;
  const transientTargets = new Set<string>();
  const fullscreen = (id: string, code: string, fragment: string, reads: string[], output = id, targetScale = scale) => {
    if (output !== "screen") targets.push({ id: output, format: "rgba16float", scale: targetScale });
    if (output !== "screen" && output !== "dof" && targetScale === scale) transientTargets.add(output);
    passes.push({ kind: "fullscreen", id, code, fragment, reads, output }); color = output;
  };
  const stages = ["scene", "fog", "dof", "bloom", "tonemap"];
  for (const item of topology.passes ?? []) {
    if (item.before && item.after || !stages.includes(item.before ?? item.after ?? "bloom") || item.before === "scene") throw new Error("Invalid World post-pass placement");
  }
  const custom = (stage: string, before: boolean) => {
    for (const item of topology.passes ?? []) {
      if ((before ? item.before : item.after ?? (!item.before ? "bloom" : undefined)) !== stage) continue;
      const id = `custom-post-${customIndex++}`;
      fullscreen(item.id ?? id, customPostCode(worldBindings, item.wgsl), "customPost", [color, "depth", "hdr", ...(item.reads ?? [])], id);
    }
  };
  const order = topology.postOrder ?? ["fog", "dof", "bloom"];
  if (order.length !== 3 || new Set(order).size !== 3 || order.some(stage => !["fog", "dof", "bloom"].includes(stage))) throw new Error("World postOrder must contain fog, dof and bloom exactly once");
  custom("scene", false);
  for (const stage of order) {
    custom(stage, true);
    if (stage === "fog") fullscreen("fog", fogCode(worldBindings, !!topology.shafts), "fog", [color, "depth", ...(topology.shafts ? ["shafts"] : [])]);
    if (stage === "dof" && topology.dof) {
      const source = color, dof = dofCode(worldBindings, topology.dofSamples ?? samples);
      fullscreen("dof-gather", dof.gather, "gather", [source, "depth"], "dof", scale * (topology.dofScale ?? .5));
      fullscreen("dof-composite", dof.composite, "focusComposite", [source, "depth", "dof"]);
    }
    if (stage === "bloom") {
      const bloomSource = color;
      passes.push({ kind: "fullscreen", id: "bloom-threshold", code: threshold, fragment: "threshold", reads: [color], output: "bloom@0" });
      for (let mip = 1; mip < levels; mip++) passes.push({ kind: "fullscreen", id: `bloom-down-${mip}`, code: downsample, fragment: "downsample", reads: [`bloom@${mip - 1}`], output: `bloom@${mip}` });
      passes.push({ kind: "fullscreen", id: `bloom-up-${levels - 1}`, code: downsample, fragment: "downsample", reads: [`bloom@${levels - 1}`], output: `bloom-up@${levels - 1}` });
      for (let mip = levels - 2; mip >= 0; mip--) passes.push({ kind: "fullscreen", id: `bloom-up-${mip}`, code: upsample, fragment: "upsample", reads: [`bloom-up@${mip + 1}`, `bloom@${mip}`], output: `bloom-up@${mip}` });
      fullscreen("bloom-composite", bloomComposite, "bloomComposite", [bloomSource, "bloom-up@0"]);
    }
    custom(stage, false);
  }
  custom("tonemap", true);
  const postTone = (topology.passes ?? []).some(item => item.after === "tonemap");
  fullscreen("tonemap", finalCode(worldBindings), "tonemap", [color], postTone ? "tonemapped" : "screen");
  custom("tonemap", false);
  if (postTone) fullscreen("screen", copyCode, "copyColor", [color], "screen");
  const passIds = new Set<string>();
  for (const pass of passes) {
    if (passIds.has(pass.id)) throw new Error("World pass id is duplicated: " + pass.id);
    passIds.add(pass.id);
  }
  if (!(topology.passes ?? []).some(pass => pass.reads?.length)) {
    const aliases = new Map<string, string>(), used = new Set<string>();
    for (const pass of passes) {
      if (pass.reads) pass.reads = pass.reads.map(id => aliases.get(id) ?? id);
      if (pass.kind !== "fullscreen" || !transientTargets.has(pass.output)) continue;
      const output = ["post-a", "post-b"].find(id => !pass.reads?.includes(id))!;
      aliases.set(pass.output, output); used.add(output); pass.output = output;
    }
    for (let i = targets.length - 1; i >= 0; i--) if (transientTargets.has(targets[i].id)) targets.splice(i, 1);
    for (const id of used) targets.push({ id, format: "rgba16float", scale });
  }
  return { targets, passes, uniformsSize: worldHeaderSize + instanceCount * worldInstanceSize };
}
