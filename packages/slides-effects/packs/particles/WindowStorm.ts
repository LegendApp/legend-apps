import { particleOptions, type ParticleOptions } from "./options";
import { particleFrame } from "./Frame";

export const sidebarCount = 384;

// Analytic motion stays in the vertex shader; the host supplies shared playback time.
export function createWindowStorm(options: ParticleOptions = {}) {
  const { particleCount, speed, scale } = particleOptions(options, sidebarCount);
  return { particleCount, program: `${particleFrame}
struct Particle {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) shade: f32,
}
@vertex fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> Particle {
  let quadIndex = array<u32, 6>(0, 1, 2, 2, 1, 3)[vertexIndex];
  let id = f32(instanceIndex);
  let t = clock.time * ${speed};
  let x = f32(quadIndex % 2);
  let y = floor(f32(quadIndex) / 2);
  let depth = fract(id * 0.618034);
  let phase = id * 2.399963;
  let angle = phase + t * (0.12 + depth * 0.16);
  let radius = 0.12 + sqrt((id + 1) / ${particleCount}.0) * 1.2;
  let cx = cos(angle) * radius * 1.4 * ${scale};
  let cy = sin(angle) * radius * 0.82 * ${scale};
  let spin = sin(phase + t * 0.35) * 0.65;
  let width = 0.055 + depth * 0.14;
  let px = (x - 0.5) * width;
  let py = (y - 0.5) * width * 1.25;
  let rotatedX = px * cos(spin) - py * sin(spin);
  let rotatedY = px * sin(spin) + py * cos(spin);
  return Particle(vec4f(cx + rotatedX / clock.aspect, cy + rotatedY, 0, 1),
    vec2f(x, y),
    depth);
}
@fragment fn particleFragment(input: Particle) -> @location(0) vec4f {
  let uv = input.uv;
  let shade = input.shade;

  let qx = abs(uv.x - 0.5) - 0.42;
  let qy = abs(uv.y - 0.5) - 0.44;
  let distance = length(vec2f(max(qx, 0), max(qy, 0))) + min(max(qx, qy), 0) - 0.06;
  if (distance > 0) { discard; }
  let edge = 1 - smoothstep(0, 0.025, -distance);
  let sheen = pow(max(0, 1 - abs(uv.x + uv.y - 0.6)), 6);
  let row = step(0.7, fract(uv.y * 9));
  let lines = row * step(0.14, uv.y) * step(uv.y, 0.88)
    * step(0.15, uv.x) * step(uv.x, 0.8);
  return vec4f(
    0.025 + shade * 0.08 + edge * 0.4 + sheen * 0.1 + lines * 0.16,
    0.06 + shade * 0.12 + edge * 0.75 + sheen * 0.2 + lines * 0.2,
    0.12 + shade * 0.2 + edge * 0.85 + sheen * 0.35 + lines * 0.24,
    1,
  );
}
` };
}

export const sidebarStorm = createWindowStorm().program;
