import { particleOptions, type ParticleOptions } from "./options";
import { particleFrame } from "./Frame";

export const gpuInterfaceRevealCount = 4096;

// Analytic motion stays in the vertex shader; the host supplies shared playback time.
export function createInterfaceReveal({ columns = 80, intensity = 1, ...options }: ParticleOptions & { columns?: number; intensity?: number } = {}) {
  const { particleCount, speed, scale } = particleOptions(options, gpuInterfaceRevealCount);
  if (!Number.isInteger(columns) || columns < 2 || columns > 256) throw new Error("Invalid interface column count");
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new Error("Invalid interface intensity");
  const rows = Math.max(2, Math.ceil(particleCount / columns));
  return { particleCount, program: `${particleFrame}
struct Particle {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) region: f32,
  @location(2) glow: f32,
  @location(3) visible: f32,
}
@vertex fn particleVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> Particle {
  let quadIndex = array<u32, 6>(0, 1, 2, 2, 1, 3)[vertexIndex];
  let id = f32(instanceIndex);
  let x = f32(quadIndex % 2);
  let y = floor(f32(quadIndex) / 2);
  let column = f32(instanceIndex % ${columns}u) * 79 / ${columns - 1}.0;
  let row = floor(id / ${columns}.0) * 51 / ${rows - 1}.0;
  let seed = fract(id * 0.618034);
  let cycle = fract(clock.time * 0.095 * ${speed} * ${0.5 + intensity * 0.5});
  let progress = smoothstep(0.08 + seed * 0.16, 0.7 + seed * 0.08, cycle);

  let angle = id * 0.117 + clock.time * 0.48 * ${speed} * ${0.5 + intensity * 0.5};
  let radius = 0.15 + seed * 1.22;
  let sourceX = cos(angle) * radius * 1.5;
  let sourceY = sin(angle) * radius * 0.78;
  let targetX = (-0.82 + column / 79 * 1.64) * ${scale};
  let targetY = (0.7 - row / 51 * 1.4) * ${scale};
  let bend = sin(progress * 3.141593) * sin(id * 0.41) * 0.35;
  let centerX = mix(sourceX, targetX, progress);
  let centerY = mix(sourceY, targetY, progress) + bend;
  let pointSize = 0.006 + seed * 0.006 + progress * 0.003;
  let sidebar = 1 - step(18, column);
  let titlebar = step(row, 5);
  let border = max(
    max(step(column, 1), step(78, column)),
    max(step(row, 1), step(50, row)),
  );
  let insideRows = step(8, row) * step(row, 47);
  let sidebarRows = sidebar * insideRows * step(0.48, fract(row * 0.18));
  let contentArea = step(24, column) * step(column, 72) * insideRows;
  let contentLines = contentArea * step(0.68, fract(row * 0.14));
  let visible = max(border, max(titlebar, max(sidebarRows, contentLines))) * ${intensity === 0 ? "0.0" : `step(seed, ${intensity})`};

  return Particle(vec4f(centerX + (x - 0.5) * pointSize / clock.aspect, centerY + (y - 0.5) * pointSize, 0, 1),
    vec2f(x, y),
    max(sidebar, titlebar),
    progress,
    visible);
}
@fragment fn particleFragment(input: Particle) -> @location(0) vec4f {
  let uv = input.uv;
  let region = input.region;
  let glow = input.glow;
  let visible = input.visible;

  if (visible < 0.5) { discard; }
  let distance = length(vec2f(uv.x - 0.5, uv.y - 0.5));
  if (distance > 0.5) { discard; }
  let edge = 1 - smoothstep(0.28, 0.5, distance);
  return vec4f(
    0.2 + region * 0.28,
    0.55 + glow * 0.33,
    0.76 + region * 0.22,
    edge * (0.42 + glow * 0.58),
  );
}
` };
}

export const gpuInterfaceReveal = createInterfaceReveal().program;
