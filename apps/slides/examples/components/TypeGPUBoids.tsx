/** Render with <TypeGPUShader code={boidsProgram} particles particleCount={500} />. */
export const boidsProgram = `
struct Clock { time: f32, dt: f32, frame: f32, step: f32, aspect: f32, brightness: f32, pad: vec2f }
@group(0) @binding(0) var<uniform> clock: Clock;
@group(0) @binding(1) var<storage, read> boids: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> next: array<vec4f>;
fn hash(i: f32) -> f32 { return fract(sin(i * 12.9898) * 43758.5453); }
@compute @workgroup_size(64) fn simulate(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= 500u) { return; }
  if (clock.frame < 1.0) { let angle = hash(f32(i) + 31.0) * 6.283185;
    next[i] = vec4f(hash(f32(i)+1.0)*2.0-1.0, hash(f32(i)+900.0)*2.0-1.0, cos(angle)*0.2, sin(angle)*0.2); return; }
  let current = boids[i];
  var separation = vec2f(0); var alignment = vec2f(0); var cohesion = vec2f(0); var neighbors = 0.0;
  for (var j = 0u; j < 500u; j++) {
    if (j == i) { continue; }
    let other = boids[j]; let distance = length(current.xy - other.xy);
    if (distance < 0.05) { separation += current.xy - other.xy; }
    if (distance < 0.3) { alignment += other.zw; cohesion += other.xy; neighbors += 1.0; }
  }
  if (neighbors > 0.0) { alignment /= neighbors; cohesion = cohesion / neighbors - current.xy; }
  let dt = min(clock.dt, 0.05);
  var velocity = current.zw + (separation * 6.0 + alignment * 0.6 + cohesion * 0.06) * dt;
  velocity = velocity / max(length(velocity), 0.0001) * clamp(length(velocity), 0.05, 0.6);
  let position = fract((current.xy + velocity * dt + vec2f(1.08)) / 2.16) * 2.16 - vec2f(1.08);
  next[i] = vec4f(position, velocity);
}
struct Vertex { @builtin(position) position: vec4f, @location(0) color: vec4f }
@vertex fn vertexMain(@builtin(vertex_index) i: u32) -> Vertex {
  var points = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  var out: Vertex; out.position = vec4f(points[i],0,1); out.color = vec4f(0.015,0.025,0.05,1); return out;
}
@fragment fn fragmentMain(v: Vertex) -> @location(0) vec4f { return v.color; }
@vertex fn particleVertex(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> Vertex {
  var points = array<vec2f,6>(vec2f(0,0.04),vec2f(-0.02,-0.02),vec2f(0.02,-0.02),vec2f(0,0.04),vec2f(0.02,-0.02),vec2f(0,0.04));
  let b = boids[instance]; let angle = -atan2(b.z,b.w); let p = points[vertex];
  let rotated = vec2f(p.x*cos(angle)-p.y*sin(angle),p.x*sin(angle)+p.y*cos(angle));
  var out: Vertex; out.position=vec4f(b.xy+rotated,0,1); out.color=vec4f(sin(vec3f(0,0.345,0.867)+vec3f(angle))*0.45+vec3f(0.45),1); return out;
}
@fragment fn particleFragment(v: Vertex) -> @location(0) vec4f { return v.color; }
`;
