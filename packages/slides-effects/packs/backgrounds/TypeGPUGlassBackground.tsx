import { Background } from "@legend-apps/presentation";
import { cloneElement, type ReactElement } from "react";
import { d, tgpu } from "typegpu";

const Frame = d.struct({ time: d.f32, dt: d.f32, frame: d.f32, step: d.f32, aspect: d.f32, brightness: d.f32, padding: d.vec2f }).$name("GlassFrame");

// Positions/velocities live in ping-pong GPU buffers. The analytic gradient
// shades the original glass style without five distance-field evaluations.
export const interactingGlassProgram = tgpu.resolve({ externals: { Frame }, template: `
@group(0) @binding(0) var<uniform> clock: Frame;
@group(0) @binding(1) var<storage, read> previous: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> next: array<vec4f>;
fn radius(i: u32) -> f32 {
  let sizes=array<f32,6>(0.185,0.155,0.14,0.13,0.105,0.115);
  return sizes[i];
}
fn initial(i: u32) -> vec2f {
  let centers=array<vec2f,6>(vec2f(-0.36,0.16),vec2f(0.27,0.19),vec2f(0.57,-0.05),vec2f(-0.152,-0.22),vec2f(0.254,-0.21),vec2f(0.26,0.244));
  return centers[i]*vec2f(min(clock.aspect/1.7778,1.0),1);
}
@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i=gid.x; if(i>=6u) { return; }
  let id=f32(i);
  if(clock.frame<0.5) {
    let angle=id*2.39996+0.6;
    next[i]=vec4f(initial(i),vec2f(cos(angle),sin(angle))*0.025);
    return;
  }
  var state=previous[i];
  var force=vec2f(0);
  for(var j=0u;j<6u;j++) {
    if(i==j) { continue; }
    let delta=state.xy-previous[j].xy;
    let distance=max(length(delta),0.001);
    let reach=(radius(i)+radius(j))*0.85;
    force+=delta/distance*max(reach-distance,0.0)*0.45;
  }
  let dt=min(clock.dt,0.04);
  var velocity=state.zw+force*dt;
  let speed=length(velocity);
  velocity*=min(1.0,0.055/max(speed,0.001));
  var position=state.xy+velocity*dt;
  let bounds=max(vec2f(clock.aspect*0.5,0.5)-vec2f(radius(i)*0.5),vec2f(0.02));
  if(position.x < -bounds.x || position.x > bounds.x) { velocity.x=-velocity.x; }
  if(position.y < -bounds.y || position.y > bounds.y) { velocity.y=-velocity.y; }
  next[i]=vec4f(clamp(position,-bounds,bounds),velocity);
}
// Signed distance and derivative, merged with the same smooth-min as Skia.
fn field(p: vec2f) -> vec3f {
  var result=vec3f(100,0,0);
  for(var i=0u;i<6u;i++) {
    let delta=p-previous[i].xy;
    let len=max(length(delta),0.00001);
    let sample=vec3f(len-radius(i),delta/len);
    let h=clamp(0.5+0.5*(sample.x-result.x)/0.09,0.0,1.0);
    result=vec3f(mix(sample.x,result.x,h)-0.09*h*(1.0-h),mix(sample.yz,result.yz,h));
  }
  return result;
}
fn backdrop(p: vec2f, aa: f32) -> vec3f {
  let light=exp(-dot(p-vec2f(-0.5,-0.35),p-vec2f(-0.5,-0.35))*3.0);
  let glow=exp(-dot(p-vec2f(0.55,0.30),p-vec2f(0.55,0.30))*5.0);
  let cell=abs(fract(p/0.12+0.5)-0.5)*0.12;
  let grid=1.0-smoothstep(0.0,aa,min(cell.x,cell.y));
  return vec3f(0.006,0.009,0.014)+vec3f(0.036,0.049,0.067)*light
    +vec3f(0.020,0.033,0.045)*glow+vec3f(0.025,0.033,0.044)*grid;
}
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let uv=vec2f(f32((index<<1u)&2u),f32(index&2u));
  return VertexOutput(vec4f(uv*vec2f(2,-2)+vec2f(-1,1),0,1),uv);
}
@fragment fn fragmentMain(in: VertexOutput) -> @location(0) vec4f {
  let p=(in.uv-0.5)*vec2f(clock.aspect,1);
  let sample=field(p);
  let distance=sample.x;
  let normal=sample.yz/max(length(sample.yz),0.00001);
  let pixel=max(fwidth(p.y),0.00001);
  let depth=max(-distance,0.0);
  let inside=1.0-smoothstep(-pixel,pixel,distance);
  let bend=0.065*(1.0-exp(-depth*180.0))*exp(-depth*22.0);
  let glass=backdrop(p-normal*bend,pixel*1.3);
  let directional=pow(abs(dot(normal,normalize(vec2f(-0.6,-0.8)))),5.0);
  let rim=exp(-abs(distance)*700.0);
  let shoulder=exp(-depth*65.0)*inside;
  let shadow=exp(-abs(distance-0.008)*140.0)*(1.0-inside);
  var color=mix(backdrop(p,pixel*1.3),glass*1.13+vec3f(0.004,0.006,0.009),inside);
  color*=1.0-shadow*0.30;
  color+=vec3f(0.68,0.77,0.88)*(rim*(0.035+directional*0.20)+shoulder*directional*0.065);
  return vec4f(color*clock.brightness*0.7,1);
}
` });

/** Supply the host's <TypeGPUShader /> from MDX; all drawing stays host-owned. */
export function TypeGPUGlassBackground({ children }: { children: ReactElement }) {
  return <Background>{cloneElement(children as ReactElement<Record<string, unknown>>, {
    code: interactingGlassProgram, background: true, particleCount: 6,
  })}</Background>;
}
