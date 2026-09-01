import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Canvas, type CanvasRef } from "react-native-webgpu";

const canvasWidth = 1500;
const canvasHeight = 560;
const noiseSize = 256;

// The volumetric raymarching approach is adapted from Software Mansion's
// TypeGPU Clouds example. See ../THIRD_PARTY_NOTICES.md.
const cloudShader = `
  struct Uniforms {
    resolution: vec2f,
    time: f32,
    padding: f32,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;
  @group(0) @binding(1) var noiseTexture: texture_2d<f32>;
  @group(0) @binding(2) var noiseSampler: sampler;

  fn hash21(position: vec2f) -> f32 {
    return fract(sin(dot(position, vec2f(127.1, 311.7))) * 43758.5453);
  }

  fn noise3(position: vec3f) -> f32 {
    let cell = floor(position);
    let local = fract(position);
    let smooth = local * local * (vec3f(3.0) - 2.0 * local);
    let offset = vec2f(37.0, 239.0);
    let uv0 = fract((cell.xy + smooth.xy + offset * cell.z) / ${noiseSize}.0);
    let uv1 = fract((cell.xy + smooth.xy + offset * (cell.z + 1.0)) / ${noiseSize}.0);
    let low = textureSampleLevel(noiseTexture, noiseSampler, uv0, 0.0).r;
    let high = textureSampleLevel(noiseTexture, noiseSampler, uv1, 0.0).r;
    return mix(low, high, smooth.z) * 2.0 - 1.0;
  }

  fn fbm(position: vec3f) -> f32 {
    var value = noise3(position) * 0.5;
    value += noise3(position * 2.03 + vec3f(11.7, 3.1, 7.9)) * 0.25;
    value += noise3(position * 4.11 + vec3f(4.2, 19.3, 2.4)) * 0.125;
    value += noise3(position * 8.23 + vec3f(8.8, 5.4, 17.1)) * 0.0625;
    return value;
  }

  fn cloudDensity(position: vec3f) -> f32 {
    let wind = vec3f(uniforms.time * 0.018, uniforms.time * 0.006, uniforms.time * 0.055);
    let broad = fbm(position * 0.72 + wind);
    let detail = noise3(position * 3.7 - wind * 1.8) * 0.13;
    let layer = 0.7 - abs(position.y + 0.2) * 0.21;
    let billow = sin(position.z * 0.42 + position.x * 0.3) * 0.08;
    return clamp((broad + detail + layer + billow - 0.48) * 1.65, 0.0, 1.0);
  }

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
    let aspect = uniforms.resolution.x / uniforms.resolution.y;
    let screen = position.xy / uniforms.resolution;
    let uv = vec2f((screen.x - 0.5) * aspect, screen.y - 0.5);
    let rayOrigin = vec3f(
      sin(uniforms.time * 0.09) * 0.38,
      -0.48 + sin(uniforms.time * 0.13) * 0.08,
      uniforms.time * 0.12
    );
    let rayDirection = normalize(vec3f(uv.x, -uv.y * 0.88 + 0.08, 1.15));
    let sunDirection = normalize(vec3f(0.72, 0.38, 0.58));
    let sunAmount = max(dot(rayDirection, sunDirection), 0.0);

    let horizon = smoothstep(-0.42, 0.58, rayDirection.y);
    var color = mix(vec3f(0.014, 0.018, 0.075), vec3f(0.23, 0.08, 0.32), horizon);
    color += vec3f(1.0, 0.22, 0.08) * pow(sunAmount, 18.0) * 0.55;
    color += vec3f(1.0, 0.72, 0.32) * pow(sunAmount, 180.0) * 2.4;

    let starCell = floor(screen * uniforms.resolution / 3.0);
    let star = pow(hash21(starCell), 55.0) * (1.0 - horizon * 0.55);
    color += vec3f(0.45, 0.68, 1.0) * star;

    var accumulatedColor = vec3f(0.0);
    var accumulatedAlpha = 0.0;
    var depth = hash21(floor(position.xy)) * 0.065;

    for (var step = 0; step < 64; step++) {
      let samplePosition = rayOrigin + rayDirection * depth;
      let density = cloudDensity(samplePosition);
      if (density > 0.015) {
        let shadowDensity = cloudDensity(samplePosition + sunDirection * 0.24);
        let directionalLight = clamp(0.28 + (density - shadowDensity) * 5.2, 0.0, 1.0);
        let silverLining = pow(clamp(1.0 - density, 0.0, 1.0), 3.0) * pow(sunAmount, 3.0);
        let depthTint = clamp(depth / 5.5, 0.0, 1.0);
        let cool = mix(vec3f(0.09, 0.16, 0.48), vec3f(0.38, 0.12, 0.52), depthTint);
        let warm = vec3f(1.15, 0.38, 0.16) * directionalLight;
        let cloudColor = cool * (0.55 + directionalLight * 0.45) + warm + silverLining * 1.6;
        let alpha = density * 0.105 * (1.0 - accumulatedAlpha);
        accumulatedColor += cloudColor * alpha;
        accumulatedAlpha += alpha;
        if (accumulatedAlpha > 0.97) {
          break;
        }
      }
      depth += 0.075;
    }

    color = color * (1.0 - accumulatedAlpha) + accumulatedColor;
    let vignetteUv = screen * (vec2f(1.0) - screen.yx);
    let vignette = pow(clamp(vignetteUv.x * vignetteUv.y * 20.0, 0.0, 1.0), 0.18);
    color *= vignette;
    color = vec3f(1.0) - exp(-color * 1.35);
    color = pow(color, vec3f(0.86));
    return vec4f(color, 1.0);
  }
`;

function createNoise() {
  const noise = new Uint8Array(noiseSize * noiseSize);
  let state = 0x9e3779b9;
  for (let index = 0; index < noise.length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    noise[index] = state & 0xff;
  }
  return noise;
}

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
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) {
          throw new Error("No WebGPU adapter is available.");
        }
        device = await adapter.requestDevice();
        if (cancelled || !canvasRef.current) {
          device.destroy();
          return;
        }
        const bufferUsage = globalThis.GPUBufferUsage;
        const textureUsage = globalThis.GPUTextureUsage;
        if (!bufferUsage || !textureUsage) {
          throw new Error("WebGPU resource constants are not available.");
        }

        const surface = canvasRef.current.getNativeSurface();
        const context = canvasRef.current.getContext("webgpu");
        if (!context) {
          throw new Error("The WebGPU canvas is not ready.");
        }
        surface.width = canvasWidth;
        surface.height = canvasHeight;

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ alphaMode: "opaque", device, format });
        const uniformBuffer = device.createBuffer({
          size: 16,
          usage: bufferUsage.COPY_DST | bufferUsage.UNIFORM,
        });
        const noiseTexture = device.createTexture({
          format: "r8unorm",
          size: { height: noiseSize, width: noiseSize },
          usage: textureUsage.COPY_DST | textureUsage.TEXTURE_BINDING,
        });
        device.queue.writeTexture(
          { texture: noiseTexture },
          createNoise(),
          { bytesPerRow: noiseSize },
          { height: noiseSize, width: noiseSize },
        );
        const sampler = device.createSampler({
          addressModeU: "repeat",
          addressModeV: "repeat",
          magFilter: "linear",
          minFilter: "linear",
        });

        const module = device.createShaderModule({ code: cloudShader });
        const pipeline = await device.createRenderPipelineAsync({
          fragment: { entryPoint: "fragmentMain", module, targets: [{ format }] },
          layout: "auto",
          primitive: { topology: "triangle-list" },
          vertex: { entryPoint: "vertexMain", module },
        });
        const bindGroup = device.createBindGroup({
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: noiseTexture.createView() },
            { binding: 2, resource: sampler },
          ],
          layout: pipeline.getBindGroupLayout(0),
        });

        const startedAt = performance.now();
        const render = (now: number) => {
          if (cancelled || !device) {
            return;
          }
          const time = isPreview ? 18.0 : (now - startedAt) / 1_000;
          device.queue.writeBuffer(
            uniformBuffer,
            0,
            new Float32Array([surface.width, surface.height, time, 0]),
          );
          const encoder = device.createCommandEncoder();
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              clearValue: { a: 1, b: 0.03, g: 0.005, r: 0.002 },
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
        <Text style={styles.eyebrow}>VOLUMETRIC RAY MARCH • 64 DEPTH SAMPLES</Text>
        <Text style={styles.title}>Cloudbreaker</Text>
        <Text style={styles.subtitle}>Procedural density, self-shadowing, and cinematic light</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { height: canvasHeight, width: canvasWidth },
  error: { color: "#fda4af", fontSize: 24, marginTop: 14 },
  eyebrow: { color: "#fda4af", fontSize: 20, fontWeight: "700", letterSpacing: 4 },
  frame: {
    alignSelf: "center",
    borderColor: "#4c1d95",
    borderRadius: 34,
    borderWidth: 2,
    height: canvasHeight,
    marginTop: 24,
    overflow: "hidden",
    width: canvasWidth,
  },
  label: { left: 52, position: "absolute", top: 40 },
  subtitle: { color: "#ddd6fe", fontSize: 22, marginTop: 8 },
  title: { color: "#fff", fontSize: 52, fontWeight: "800", marginTop: 8 },
});
