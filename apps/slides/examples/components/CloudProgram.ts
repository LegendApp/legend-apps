// Procedural clouds use the host's shared playback clock; no JS frame callback.
export const cloudProgram = `
struct Frame { time: f32, dt: f32, frame: f32, step: f32, aspect: f32, brightness: f32, padding: vec2f }
@group(0) @binding(0) var<uniform> clock: Frame;
@compute @workgroup_size(64) fn simulate() {}
struct Surface { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Surface {
  let uv = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return Surface(vec4f(uv * vec2f(2, -2) + vec2f(-1, 1), 0, 1), uv);
}
fn hash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3f(1,0,0)), u.x), mix(hash(i + vec3f(0,1,0)), hash(i + vec3f(1,1,0)), u.x), u.y),
    mix(mix(hash(i + vec3f(0,0,1)), hash(i + vec3f(1,0,1)), u.x), mix(hash(i + vec3f(0,1,1)), hash(i + vec3f(1,1,1)), u.x), u.y), u.z);
}
fn density(p: vec3f) -> f32 {
  let drift = p + vec3f(clock.time * 0.06, 0, 0);
  let field = noise(drift) * 0.6 + noise(drift * 2.03) * 0.3 + noise(drift * 4.01) * 0.1;
  return max(0.0, field - 0.48) * smoothstep(-1.0, -0.3, p.y) * (1.0 - smoothstep(1.0, 2.0, p.y));
}
@fragment fn fragmentMain(input: Surface) -> @location(0) vec4f {
  let uv = (input.uv - 0.5) * vec2f(clock.aspect, -1.0);
  let ray = normalize(vec3f(uv, 1.1));
  let origin = vec3f(0, -0.2, clock.time * 0.04);
  var color = mix(vec3f(0.55, 0.72, 0.9), vec3f(0.12, 0.32, 0.62), clamp(input.uv.y, 0.0, 1.0));
  var cloud = vec3f(0);
  var transmission = 1.0;
  for (var i = 0; i < 48; i++) {
    let p = origin + ray * (f32(i) * 0.14 + 0.5);
    let amount = density(p);
    let light = clamp((amount - density(p + vec3f(-0.15, 0.25, -0.1))) * 3.0 + 0.65, 0.2, 1.0);
    let alpha = 1.0 - exp(-amount * 1.4);
    cloud += transmission * alpha * mix(vec3f(0.35, 0.44, 0.58), vec3f(1.0, 0.96, 0.88), light);
    transmission *= 1.0 - alpha;
  }
  color = color * transmission + cloud;
  return vec4f(color * clock.brightness, 1);
}
`;
