import { particleOptions, type ParticleOptions } from "./options";
import { particleFrame } from "./Frame";

export const gpuConstellationCount = 1024;

// Analytic motion stays in the vertex shader; the host supplies shared playback time.
export function createConstellation({ rows = 5, ...options }: ParticleOptions & { rows?: number } = {}) {
  const { particleCount, speed, scale } = particleOptions(options, gpuConstellationCount);
  if (!Number.isInteger(rows) || rows < 1 || rows > 64) throw new Error("Invalid constellation row count");
  return { particleCount, program: `${particleFrame}
struct Particle {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) glow: f32,
}
@vertex fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> Particle {
  let quadIndex = array<u32, 6>(0, 1, 2, 2, 1, 3)[vertexIndex];
  let id = f32(instanceIndex);
  let x = f32(quadIndex % 2);
  let y = floor(f32(quadIndex) / 2);
  let seed = fract(id * 0.618034);
  let seed2 = fract(id * 0.381966 + 0.27);
  let cycle = fract(clock.time * 0.105 * ${speed} + seed * 1.18);
  let progress = smoothstep(0.08, 0.86, cycle);
  let row = f32(instanceIndex % ${rows}u);

  let sourceX = (-1.42 + seed * 0.78) * ${scale};
  let sourceY = (-0.78 + seed2 * 1.56) * ${scale};
  let targetX = (0.14 + seed * 0.72) * ${scale};
  let targetY = (0.63 - row * ${rows === 1 ? 0 : 1.26 / (rows - 1)} + (seed2 - 0.5) * 0.085) * ${scale};
  let bend = sin(progress * 3.141593) * (seed - 0.5) * 0.48;
  let cx = mix(sourceX, targetX, progress);
  let cy = mix(sourceY, targetY, progress) + bend;
  let sizePx = 0.008 + seed2 * 0.012 + (1 - progress) * 0.006;

  return Particle(vec4f(cx + (x - 0.5) * sizePx / clock.aspect, cy + (y - 0.5) * sizePx, 0, 1),
    vec2f(x, y),
    progress);
}
@fragment fn particleFragment(input: Particle) -> @location(0) vec4f {
  let uv = input.uv;
  let glow = input.glow;

  let distance = length(vec2f(uv.x - 0.5, uv.y - 0.5));
  if (distance > 0.5) { discard; }
  let edge = 1 - smoothstep(0.25, 0.5, distance);
  return vec4f(
    0.22 + glow * 0.28,
    0.55 + glow * 0.35,
    0.82 + glow * 0.18,
    edge,
  );
}
` };
}

export const gpuConstellation = createConstellation().program;
