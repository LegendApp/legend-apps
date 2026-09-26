export const gameOfLifeShader = `
struct Clock { time: f32, dt: f32, frame: f32, step: f32, aspect: f32, brightness: f32, pad: vec2f }
@group(0) @binding(0) var<uniform> clock: Clock;
@group(0) @binding(1) var<storage, read> cells: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> next: array<vec4f>;
fn alive(x: i32, y: i32) -> f32 { return cells[u32((y + 64) % 64 * 64 + (x + 64) % 64)].x; }
@compute @workgroup_size(64) fn simulate(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= 4096u) { return; }
  if (clock.frame < 1.0) { next[i] = vec4f(select(0.0, 1.0, fract(sin(f32(i) * 12.9898) * 43758.5453) > 0.72), 0, 0, 0); return; }
  // Shared-clock generation identity avoids speeding up on high-refresh displays.
  let generation = floor(clock.time * 10.0);
  if (cells[i].y == generation) { next[i] = cells[i]; return; }
  let x = i32(i % 64u); let y = i32(i / 64u);
  var neighbors = 0.0;
  for (var dy = -1; dy <= 1; dy++) { for (var dx = -1; dx <= 1; dx++) { if (dx != 0 || dy != 0) { neighbors += alive(x + dx, y + dy); } } }
  let living = neighbors == 3.0 || (neighbors == 2.0 && cells[i].x > 0.5);
  next[i] = vec4f(select(0.0, 1.0, living), generation, 0, 0);
}
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> Vertex {
  var points = array<vec2f, 3>(vec2f(-1,-1), vec2f(3,-1), vec2f(-1,3));
  var out: Vertex; out.position = vec4f(points[i],0,1); out.uv = points[i] * 0.5 + 0.5; return out;
}
@fragment fn fragmentMain(v: Vertex) -> @location(0) vec4f {
  let xy = vec2u(clamp(v.uv, vec2f(0), vec2f(0.9999)) * 64.0);
  let living = cells[xy.y * 64u + xy.x].x;
  let edge = min(fract(v.uv.x * 64.0), fract(v.uv.y * 64.0));
  return vec4f(mix(vec3f(0.02,0.04,0.08), vec3f(0.3,0.9,0.85), living * smoothstep(0.02,0.12,edge)),1);
}`;
