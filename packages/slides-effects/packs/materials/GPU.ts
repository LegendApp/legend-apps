import { d, tgpu } from "typegpu";

const Frame = d.struct({ time: d.f32, dt: d.f32, frame: d.f32, step: d.f32,
  aspect: d.f32, brightness: d.f32, slideTime: d.f32, stepTime: d.f32 }).$name("Frame");
export const gpuFrame = `
@group(0) @binding(0) var<uniform> clock: Frame;
struct Surface { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> Surface {
  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return Surface(vec4f(uv * vec2f(2,-2) + vec2f(-1,1),0,1), uv);
}
`;
export const gpuImage = `
@group(0) @binding(3) var imageSampler: sampler;
@group(0) @binding(4) var imageTexture: texture_2d<f32>;
`;
export const gpuQuad = `
fn corner(i: u32) -> vec2f {
  let points = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  return points[i];
}
fn rotate(p: vec2f, angle: f32) -> vec2f {
  return vec2f(p.x*cos(angle)-p.y*sin(angle),p.x*sin(angle)+p.y*cos(angle));
}
fn hash2(p:vec2f)->f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn roundedBox(p: vec2f, size: vec2f, radius: f32) -> f32 {
  let q=abs(p)-size+radius;
  return length(max(q,vec2f(0)))+min(max(q.x,q.y),0.0)-radius;
}
`;
export function gpuProgram(source: string) { return tgpu.resolve({ externals: { Frame }, template: gpuFrame + source }); }
export function gpuNumber(value: number) {
  if (!Number.isFinite(value)) throw new Error("GPU geometry must be finite");
  return value.toFixed(6);
}
