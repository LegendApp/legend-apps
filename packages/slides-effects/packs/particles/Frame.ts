// TypeGPUShader owns this uniform and all per-frame submissions on the UI runtime.
export const particleFrame = `
struct Frame { time: f32, dt: f32, frame: f32, step: f32, aspect: f32, brightness: f32, padding: vec2f }
@group(0) @binding(0) var<uniform> clock: Frame;
@compute @workgroup_size(64) fn simulate() {}
struct Surface { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Surface {
  let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return Surface(vec4f(uv * vec2f(2, -2) + vec2f(-1, 1), 0, 1), uv);
}
@fragment fn fragmentMain(in: Surface) -> @location(0) vec4f {
  return vec4f(0.031, 0.047, 0.078, 1);
}
`;
