import { defineTypeGPUScene } from "@legend-apps/presentation";
import { d, std, tgpu } from "typegpu";

export const gpuConstellationCount = 1024;

// A thousand fragments converge into five visible rows in one instanced draw.
// Motion and placement remain analytic, so React only owns the scene container.
export const gpuConstellation = defineTypeGPUScene(({ format, root, size }) => {
  const clock = root.createUniform(d.f32, 0);
  const aspect = root.createUniform(d.f32, size.width / size.height);

  const vertex = tgpu.vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex, instanceIndex: d.builtin.instanceIndex },
    out: { position: d.builtin.position, uv: d.vec2f, glow: d.f32 },
  })(({ vertexIndex, instanceIndex }) => {
    const id = d.f32(instanceIndex);
    const x = d.f32(vertexIndex % 2);
    const y = std.floor(d.f32(vertexIndex) / 2);
    const seed = std.fract(id * 0.618034);
    const seed2 = std.fract(id * 0.381966 + 0.27);
    const cycle = std.fract(clock.$ * 0.105 + seed * 1.18);
    const progress = std.smoothstep(0.08, 0.86, cycle);
    const row = d.f32(instanceIndex % 5);

    const sourceX = -1.42 + seed * 0.78;
    const sourceY = -0.78 + seed2 * 1.56;
    const targetX = 0.14 + seed * 0.72;
    const targetY = 0.63 - row * 0.315 + (seed2 - 0.5) * 0.085;
    const bend = std.sin(progress * 3.141593) * (seed - 0.5) * 0.48;
    const cx = std.mix(sourceX, targetX, progress);
    const cy = std.mix(sourceY, targetY, progress) + bend;
    const sizePx = 0.008 + seed2 * 0.012 + (1 - progress) * 0.006;

    return {
      position: d.vec4f(cx + (x - 0.5) * sizePx / aspect.$, cy + (y - 0.5) * sizePx, 0, 1),
      uv: d.vec2f(x, y),
      glow: progress,
    };
  });

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f, glow: d.f32 },
    out: d.vec4f,
  })(({ uv, glow }) => {
    const distance = std.length(d.vec2f(uv.x - 0.5, uv.y - 0.5));
    if (distance > 0.5) std.discard();
    const edge = 1 - std.smoothstep(0.25, 0.5, distance);
    return d.vec4f(
      0.22 + glow * 0.28,
      0.55 + glow * 0.35,
      0.82 + glow * 0.18,
      edge,
    );
  });

  const pipeline = root.createRenderPipeline({
    vertex,
    fragment,
    primitive: { topology: "triangle-strip" },
    targets: { format },
  });

  return {
    render({ time, view }) {
      clock.write(time);
      pipeline.withColorAttachment({ view, clearValue: [0.031, 0.047, 0.078, 1] }).draw(4, gpuConstellationCount);
    },
  };
});
