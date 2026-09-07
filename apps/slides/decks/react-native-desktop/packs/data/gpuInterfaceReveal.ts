import { defineTypeGPUScene } from "@legend-apps/presentation";
import { d, std, tgpu } from "typegpu";

export const gpuInterfaceRevealCount = 4096;

// Four thousand points spiral into a desktop UI grid in one instanced draw.
export const gpuInterfaceReveal = defineTypeGPUScene(({ format, root, size }) => {
  const clock = root.createUniform(d.f32, 0);
  const aspect = root.createUniform(d.f32, size.width / size.height);

  const vertex = tgpu.vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex, instanceIndex: d.builtin.instanceIndex },
    out: { position: d.builtin.position, uv: d.vec2f, region: d.f32, glow: d.f32, visible: d.f32 },
  })(({ vertexIndex, instanceIndex }) => {
    const id = d.f32(instanceIndex);
    const x = d.f32(vertexIndex % 2);
    const y = std.floor(d.f32(vertexIndex) / 2);
    const column = d.f32(instanceIndex % 80);
    const row = std.floor(id / 80);
    const seed = std.fract(id * 0.618034);
    const cycle = std.fract(clock.$ * 0.095);
    const progress = std.smoothstep(0.08 + seed * 0.16, 0.7 + seed * 0.08, cycle);

    const angle = id * 0.117 + clock.$ * 0.48;
    const radius = 0.15 + seed * 1.22;
    const sourceX = std.cos(angle) * radius * 1.5;
    const sourceY = std.sin(angle) * radius * 0.78;
    const targetX = -0.82 + column / 79 * 1.64;
    const targetY = 0.7 - row / 51 * 1.4;
    const bend = std.sin(progress * 3.141593) * std.sin(id * 0.41) * 0.35;
    const centerX = std.mix(sourceX, targetX, progress);
    const centerY = std.mix(sourceY, targetY, progress) + bend;
    const pointSize = 0.006 + seed * 0.006 + progress * 0.003;
    const sidebar = 1 - std.step(18, column);
    const titlebar = std.step(row, 5);
    const border = std.max(
      std.max(std.step(column, 1), std.step(78, column)),
      std.max(std.step(row, 1), std.step(50, row)),
    );
    const insideRows = std.step(8, row) * std.step(row, 47);
    const sidebarRows = sidebar * insideRows * std.step(0.48, std.fract(row * 0.18));
    const contentArea = std.step(24, column) * std.step(column, 72) * insideRows;
    const contentLines = contentArea * std.step(0.68, std.fract(row * 0.14));
    const visible = std.max(border, std.max(titlebar, std.max(sidebarRows, contentLines)));

    return {
      position: d.vec4f(centerX + (x - 0.5) * pointSize / aspect.$, centerY + (y - 0.5) * pointSize, 0, 1),
      uv: d.vec2f(x, y),
      region: std.max(sidebar, titlebar),
      glow: progress,
      visible,
    };
  });

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f, region: d.f32, glow: d.f32, visible: d.f32 },
    out: d.vec4f,
  })(({ uv, region, glow, visible }) => {
    if (visible < 0.5) std.discard();
    const distance = std.length(d.vec2f(uv.x - 0.5, uv.y - 0.5));
    if (distance > 0.5) std.discard();
    const edge = 1 - std.smoothstep(0.28, 0.5, distance);
    return d.vec4f(
      0.2 + region * 0.28,
      0.55 + glow * 0.33,
      0.76 + region * 0.22,
      edge * (0.42 + glow * 0.58),
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
      pipeline.withColorAttachment({ view, clearValue: [0.031, 0.047, 0.078, 1] }).draw(4, gpuInterfaceRevealCount);
    },
  };
});
