import { defineTypeGPUScene } from "@legend-apps/presentation";
import { d, std, tgpu } from "typegpu";

export const sidebarCount = 384;

// Analytic motion in the vertex shader: one time update and one instanced draw,
// with no React updates or per-sidebar JavaScript work in the animation loop.
export const sidebarStorm = defineTypeGPUScene(({ format, root, size }) => {
  const clock = root.createUniform(d.f32, 0);
  const aspect = root.createUniform(d.f32, size.width / size.height);

  const vertex = tgpu.vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex, instanceIndex: d.builtin.instanceIndex },
    out: { position: d.builtin.position, uv: d.vec2f, shade: d.f32 },
  })(({ vertexIndex, instanceIndex }) => {
    const id = d.f32(instanceIndex);
    const t = clock.$;
    const x = d.f32(vertexIndex % 2);
    const y = std.floor(d.f32(vertexIndex) / 2);
    const depth = std.fract(id * 0.618034);
    const phase = id * 2.399963;
    const angle = phase + t * (0.12 + depth * 0.16);
    const radius = 0.12 + std.sqrt((id + 1) / sidebarCount) * 1.2;
    const cx = std.cos(angle) * radius * 1.4;
    const cy = std.sin(angle) * radius * 0.82;
    const spin = std.sin(phase + t * 0.35) * 0.65;
    const width = 0.055 + depth * 0.14;
    const px = (x - 0.5) * width;
    const py = (y - 0.5) * width * 1.25;
    const rotatedX = px * std.cos(spin) - py * std.sin(spin);
    const rotatedY = px * std.sin(spin) + py * std.cos(spin);
    return {
      position: d.vec4f(cx + rotatedX / aspect.$, cy + rotatedY, 0, 1),
      uv: d.vec2f(x, y),
      shade: depth,
    };
  });

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f, shade: d.f32 },
    out: d.vec4f,
  })(({ uv, shade }) => {
    const qx = std.abs(uv.x - 0.5) - 0.42;
    const qy = std.abs(uv.y - 0.5) - 0.44;
    const distance = std.length(d.vec2f(std.max(qx, 0), std.max(qy, 0))) + std.min(std.max(qx, qy), 0) - 0.06;
    if (distance > 0) std.discard();
    const edge = 1 - std.smoothstep(0, 0.025, -distance);
    const sheen = std.pow(std.max(0, 1 - std.abs(uv.x + uv.y - 0.6)), 6);
    const row = std.step(0.7, std.fract(uv.y * 9));
    const lines = row * std.step(0.14, uv.y) * std.step(uv.y, 0.88)
      * std.step(0.15, uv.x) * std.step(uv.x, 0.8);
    return d.vec4f(
      0.025 + shade * 0.08 + edge * 0.4 + sheen * 0.1 + lines * 0.16,
      0.06 + shade * 0.12 + edge * 0.75 + sheen * 0.2 + lines * 0.2,
      0.12 + shade * 0.2 + edge * 0.85 + sheen * 0.35 + lines * 0.24,
      1,
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
      pipeline.withColorAttachment({ view, clearValue: [0.031, 0.047, 0.078, 1] }).draw(4, sidebarCount);
    },
  };
});
