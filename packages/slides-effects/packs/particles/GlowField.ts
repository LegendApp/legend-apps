import { particleOptions, type ParticleOptions } from "./options";
import { d, tgpu } from "typegpu";

// Same uniform/storage contract as the host's UI-thread TypeGPUShader renderer.
const Frame = d.struct({ time: d.f32, dt: d.f32, frame: d.f32, step: d.f32,
  aspect: d.f32, brightness: d.f32, padding: d.vec2f }).$name("Frame");
export function createGlowField({ tintA = [.15,.8,1], tintB = [.7,.4,1], ...options }: ParticleOptions & {
  tintA?: readonly [number, number, number]; tintB?: readonly [number, number, number]; } = {}) {
  const { particleCount, speed, scale } = particleOptions(options, 1536);
  if ([...tintA, ...tintB].some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error("Invalid glow field palette");
  return { particleCount, program: tgpu.resolve({ externals: { Frame }, template: `
@group(0) @binding(0) var<uniform> clock: Frame;
@group(0) @binding(1) var<storage, read> previous: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> next: array<vec4f>;
fn hash(n:f32)->f32 { return fract(sin(n*127.1+31.7)*43758.5453); }
@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid:vec3u) {
  let i=gid.x; if(i>=${particleCount}u){return;}
  let id=f32(i); let seed=hash(id);
  let radius=sqrt((id+.5)/${particleCount}.0)*.42*${scale};
  let angle=id*2.399963+radius*17.0-(clock.time * ${speed})*(.32+.1/(radius+.15));
  let breathe=1.0+.05*sin((clock.time * ${speed})*.7+radius*9.0);
  next[i]=vec4f(.5+cos(angle)*radius*breathe,.5+sin(angle)*radius*.82*breathe,seed,0);
}
struct Out { @builtin(position) position:vec4f, @location(0) uv:vec2f, @location(1) @interpolate(flat) id:u32 }
@vertex fn vertexMain(@builtin(vertex_index) i:u32)->Out {
  let uv=vec2f(f32((i<<1u)&2u),f32(i&2u));
  return Out(vec4f(uv*vec2f(2,-2)+vec2f(-1,1),0,1),uv,0u);
}
@fragment fn fragmentMain(in:Out)->@location(0) vec4f {
  let glow=exp(-length(in.uv-vec2f(.5))*15.0)*.22;
  return vec4f(vec3f(.05,.45,.8)*glow,glow);
}
@vertex fn particleVertex(@builtin(vertex_index) i:u32,@builtin(instance_index) id:u32)->Out {
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let seed=previous[id].z;
  let radius=.003+pow(seed,7.0)*.016;
  let p=previous[id].xy+corners[i]*radius;
  return Out(vec4f(p*vec2f(2,-2)+vec2f(-1,1),0,1),corners[i],id);
}
@fragment fn particleFragment(in:Out)->@location(0) vec4f {
  let r=length(in.uv);let seed=hash(f32(in.id));
  let core=exp(-r*r*22.0);let halo=exp(-r*r*4.0)*.3;
  let brightness=.4+.6*pow(.5+.5*sin((clock.time * ${speed})*1.4+seed*60.0),2.0);
  let a=(core+halo)*brightness*(1.0-smoothstep(.8,1.0,r));
  let tint=mix(vec3f(${tintA.join(",")}),vec3f(${tintB.join(",")}),seed*seed);
  return vec4f(mix(tint,vec3f(1),core*.7)*a,a);
}
` }) };
}

export const slidesFeatureParticles = createGlowField().program;
