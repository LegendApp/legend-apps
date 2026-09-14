@group(0) @binding(0) var<uniform> time: f32;
// Animated waves
/* Constant-speed motion */
@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let glow = 0.5 + 0.5 * sin(time + position.x * 0.01);
  return vec4f(glow, 0.2, 0.8, 1.0);
}
