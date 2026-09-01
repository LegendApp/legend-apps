import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useRef, useState } from "react";
import { PixelRatio, StyleSheet, Text, View } from "react-native";
import { Canvas, GPUBufferUsage, type CanvasRef } from "react-native-webgpu";

const canvasWidth = 1500;
const canvasHeight = 560;
const portalShader = `
  struct Uniforms {
    resolution: vec2f,
    time: f32,
    padding: f32,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  @vertex
  fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
    var positions = array<vec2f, 3>(
      vec2f(-1.0, -1.0),
      vec2f(3.0, -1.0),
      vec2f(-1.0, 3.0)
    );
    return vec4f(positions[vertexIndex], 0.0, 1.0);
  }

  @fragment
  fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let uv = (position.xy * 2.0 - uniforms.resolution)
      / min(uniforms.resolution.x, uniforms.resolution.y);
    let radius = length(uv);
    let distortion = sin(uv.x * 8.0 + uniforms.time * 1.2)
      * cos(uv.y * 7.0 - uniforms.time * 1.5);
    let wave = sin(radius * 34.0 - uniforms.time * 5.0 + distortion * 2.5);
    let rings = 0.06 / (abs(wave) + 0.055);
    let horizon = 0.04 / (abs(uv.y + sin(uv.x * 4.0 + uniforms.time) * 0.08) + 0.035);
    let core = 0.018 / max(radius, 0.025);
    let vignette = 1.0 - smoothstep(0.25, 1.5, radius);
    var color = vec3f(0.03, 0.35, 1.0) * rings;
    color += vec3f(0.95, 0.12, 0.55) * horizon;
    color += vec3f(0.2, 1.0, 0.72) * core;
    color *= vignette;
    return vec4f(color, 1.0);
  }
`;

export function WebGPUPortal() {
  const { isActive, isPreview } = useSlideLifecycle();
  const canvasRef = useRef<CanvasRef>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let device: GPUDevice | undefined;

    async function start() {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          throw new Error("No WebGPU adapter is available.");
        }
        device = await adapter.requestDevice();
        if (cancelled || !canvasRef.current) {
          device.destroy();
          return;
        }

        const surface = canvasRef.current.getNativeSurface();
        const context = canvasRef.current.getContext("webgpu");
        if (!context) {
          throw new Error("The WebGPU canvas is not ready.");
        }
        const scale = PixelRatio.get();
        surface.width = Math.max(1, Math.round(surface.clientWidth * scale));
        surface.height = Math.max(1, Math.round(surface.clientHeight * scale));

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ alphaMode: "opaque", device, format });
        const module = device.createShaderModule({ code: portalShader });
        const pipeline = device.createRenderPipeline({
          fragment: { entryPoint: "fragmentMain", module, targets: [{ format }] },
          layout: "auto",
          primitive: { topology: "triangle-list" },
          vertex: { entryPoint: "vertexMain", module },
        });
        const uniformBuffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        });
        const bindGroup = device.createBindGroup({
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
          layout: pipeline.getBindGroupLayout(0),
        });
        const startedAt = performance.now();

        const render = (now: number) => {
          if (cancelled || !device) {
            return;
          }
          const time = isPreview ? 4.2 : (now - startedAt) / 1_000;
          device.queue.writeBuffer(
            uniformBuffer,
            0,
            new Float32Array([surface.width, surface.height, time, 0]),
          );
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              clearValue: { a: 1, b: 0.045, g: 0.015, r: 0.005 },
              loadOp: "clear",
              storeOp: "store",
              view: context.getCurrentTexture().createView(),
            }],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(3);
          pass.end();
          device.queue.submit([encoder.finish()]);
          context.present();

          if (isActive && !isPreview) {
            frame = requestAnimationFrame(render);
          }
        };

        frame = requestAnimationFrame(render);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      device?.destroy();
    };
  }, [isActive, isPreview]);

  return (
    <View style={styles.frame}>
      <Canvas ref={canvasRef} style={styles.canvas} />
      <View pointerEvents="none" style={styles.label}>
        <Text style={styles.eyebrow}>WEBGPU + DAWN</Text>
        <Text style={styles.title}>A native Metal-backed render pipeline</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { height: canvasHeight, width: canvasWidth },
  error: { color: "#fda4af", fontSize: 24, marginTop: 14 },
  eyebrow: { color: "#a7f3d0", fontSize: 22, fontWeight: "700", letterSpacing: 5 },
  frame: {
    borderColor: "#334155",
    borderRadius: 34,
    borderWidth: 2,
    height: canvasHeight,
    marginTop: 24,
    overflow: "hidden",
    width: canvasWidth,
  },
  label: { left: 52, position: "absolute", top: 42 },
  title: { color: "#fff", fontSize: 38, fontWeight: "700", marginTop: 10 },
});
