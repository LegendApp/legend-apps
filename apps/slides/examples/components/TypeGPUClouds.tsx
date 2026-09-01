import { useSlideLifecycle } from "@legend-apps/presentation";
import { randf } from "@typegpu/noise";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Canvas, type CanvasRef } from "react-native-webgpu";
import { common, d, std, tgpu, type TgpuRoot } from "typegpu";

const canvasWidth = 1500;
const canvasHeight = 560;
const noiseTextureSize = 256;
const fieldOfView = 1;
const cloudDriftSpeed = 0.14;
const lightAbsorption = 0.9;
const cloudCoverage = 0.68;
const cloudFrequency = 1.38;
const sunBrightness = 0.9;
const sunDirection = d.vec3f(0.82, 0.18, 0.54);
const cloudBright = d.vec3f(0.9, 0.92, 1);
const cloudDark = d.vec3f(0.06, 0.08, 0.2);
const skyAmbient = d.vec3f(0.28, 0.24, 0.46);
const sunColor = d.vec3f(0.82, 0.36, 0.12);
const skyHorizon = d.vec3f(0.22, 0.16, 0.4);
const skyZenithTint = d.vec3f(0.26, 0.12, 0.18);
const sunGlowColor = d.vec3f(1, 0.2, 0.06);
const noiseOffset = d.vec2f(37, 239);

const CloudsParams = d.struct({
  maxDistance: d.f32,
  maxSteps: d.i32,
  time: d.f32,
});

const cloudsLayout = tgpu.bindGroupLayout({
  noiseSampler: { sampler: "filtering" },
  noiseTexture: { texture: d.texture2d() },
  params: { uniform: CloudsParams },
});

// TypeGPU rewrites arithmetic in these callbacks before shader generation. Their
// signatures remain typed by tgpu.fn, while `any` keeps plain tsc from treating
// vector operators as invalid JavaScript arithmetic.
const noise3d = tgpu.fn([d.vec3f], d.f32)((position: any) => {
  "use gpu";
  const cell: any = std.floor(position);
  const fraction: any = std.fract(position);
  const interpolation: any = fraction * fraction * (3 - 2 * fraction);
  const uv0: any = std.fract((cell.xy + interpolation.xy + (noiseOffset as any) * cell.z) / noiseTextureSize);
  const uv1: any = std.fract((cell.xy + interpolation.xy + (noiseOffset as any) * (cell.z + 1)) / noiseTextureSize);
  const low: any = std.textureSampleLevel(cloudsLayout.$.noiseTexture as any, cloudsLayout.$.noiseSampler as any, uv0, 0).x;
  const high: any = std.textureSampleLevel(cloudsLayout.$.noiseTexture as any, cloudsLayout.$.noiseSampler as any, uv1, 0).x;
  return std.mix(low, high, interpolation.z) * 2 - 1;
});

const fractalNoise = tgpu.fn([d.vec3f], d.f32)((position: any) => {
  "use gpu";
  const octave0: any = position * cloudFrequency;
  const octave1: any = position * cloudFrequency * 2.03 + (d.vec3f(11.7, 3.1, 7.9) as any);
  const octave2: any = position * cloudFrequency * 4.11 + (d.vec3f(4.2, 19.3, 2.4) as any);
  let sum: any = noise3d(octave0) * 0.5;
  sum += noise3d(octave1) * 0.25;
  sum += noise3d(octave2) * 0.125;
  return sum;
});

const sampleDensity = tgpu.fn([d.vec3f], d.f32)((position: any) => {
  "use gpu";
  const coverage: any = cloudCoverage - std.abs(position.y) * 0.23;
  const billow: any = std.sin(position.z * 0.35 + position.x * 0.24) * 0.07;
  return std.saturate(fractalNoise(position) + coverage + billow) - 0.48;
});

const raymarch = tgpu.fn([d.vec3f, d.vec3f, d.vec3f], d.vec4f)((rayOrigin: any, rayDirection: any, lightDirection: any) => {
  "use gpu";
  const params = cloudsLayout.$.params;
  const stepSize = 1 / params.maxSteps;
  let distance = randf.sample() * stepSize;
  let accumulated: any = d.vec4f(0, 0, 0, 0);

  for (let step = 0; step < params.maxSteps; step++) {
    const position: any = rayOrigin + rayDirection * distance * params.maxDistance;
    const density: any = sampleDensity(position);
    if (density > 0) {
      const shadowDensity: any = sampleDensity(position + lightDirection * 0.38);
      const lightAmount: any = std.mix(0.22, 1, std.saturate(density - shadowDensity));
      const light: any = (skyAmbient as any) + (sunColor as any) * lightAmount * sunBrightness;
      const cloudColor: any = std.mix(cloudBright, cloudDark, density);
      const lit: any = cloudColor * light;
      const contribution: any = (d.vec4f(lit, 1) as any) * density * (lightAbsorption - accumulated.a);
      accumulated += contribution;
      if (accumulated.a >= lightAbsorption - 0.001) {
        break;
      }
    }
    distance += stepSize;
  }
  return accumulated;
});

function createNoise() {
  const noise = new Uint8Array(noiseTextureSize * noiseTextureSize);
  let state = 0x9e3779b9;
  for (let index = 0; index < noise.length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    noise[index] = state & 0xff;
  }
  return noise;
}

export function TypeGPUClouds() {
  const { isActive, isPreview } = useSlideLifecycle();
  const canvasRef = useRef<CanvasRef>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let device: GPUDevice | undefined;
    let root: TgpuRoot | undefined;

    async function start() {
      try {
        setError(undefined);
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
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
        surface.width = canvasWidth;
        surface.height = canvasHeight;

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ alphaMode: "opaque", device, format });
        root = tgpu.initFromDevice({ device });

        const params = root.createUniform(CloudsParams, {
          maxDistance: 11,
          maxSteps: isPreview ? 40 : 72,
          time: 0,
        });
        const resolution = root.createUniform(d.vec2f, d.vec2f(canvasWidth, canvasHeight));
        const sampler = root.createSampler({
          addressModeU: "repeat",
          addressModeV: "repeat",
          magFilter: "linear",
          minFilter: "linear",
        });
        const noiseTexture = root.createTexture({
          format: "r8unorm",
          size: [noiseTextureSize, noiseTextureSize],
        }).$usage("sampled", "render");
        noiseTexture.write(createNoise());
        const bindGroup = root.createBindGroup(cloudsLayout, {
          noiseSampler: sampler,
          noiseTexture,
          params: params.buffer,
        });

        const pipeline = root.createRenderPipeline({
          fragment: ({ uv }: any) => {
            "use gpu";
            const cloudParams: any = cloudsLayout.$.params;
            const randomSeed: any = uv * cloudParams.time;
            randf.seed2(randomSeed);
            const aspect: any = resolution.$.x / resolution.$.y;
            let screen: any = (uv - 0.5) * 2;
            screen = d.vec2f(screen.x * std.max(aspect, 1), screen.y * std.max(1 / aspect, 1));

            const lightDirection: any = std.normalize(sunDirection);
            const rayOrigin: any = d.vec3f(
              std.sin(cloudParams.time * 0.18) * 0.46,
              std.cos(cloudParams.time * 0.12) * 0.12 - 0.86,
              5.8 + std.sin(cloudParams.time * cloudDriftSpeed) * 1.2,
            );
            const rayDirection: any = std.normalize(d.vec3f(screen.x, screen.y, fieldOfView));
            const sunAmount: any = std.saturate(std.dot(rayDirection, lightDirection));
            const sunGlow: any = sunAmount ** 18;
            let sky: any = (skyHorizon as any) - (skyZenithTint as any) * rayDirection.y * 0.34;
            sky += (sunGlowColor as any) * sunGlow * 1.8;

            const clouds: any = raymarch(rayOrigin, rayDirection, lightDirection);
            const color: any = sky * (1.08 - clouds.a) + clouds.rgb;
            return d.vec4f(color, 1);
          },
          targets: { format },
          vertex: common.fullScreenTriangle,
        });
        await pipeline.initAsync();

        const startedAt = performance.now();
        const render = (now: number) => {
          if (cancelled || !root) {
            return;
          }
          params.patch({ time: isPreview ? 18 : (now - startedAt) / 1_000 });
          pipeline
            .with(bindGroup)
            .withColorAttachment({ clearValue: [0, 0, 0, 1], view: context })
            .draw(3);
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
      if (root) {
        root.destroy();
      } else {
        device?.destroy();
      }
    };
  }, [isActive, isPreview]);

  return (
    <View style={styles.frame}>
      <Canvas ref={canvasRef} style={styles.canvas} />
      <View pointerEvents="none" style={styles.label}>
        <Text style={styles.eyebrow}>TYPEGPU • 72-STEP RAY MARCH • TYPED SHADERS</Text>
        <Text style={styles.title}>Cloud Atlas</Text>
        <Text style={styles.subtitle}>Volumetric density, self-shadowing, and a procedural sunset</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { height: canvasHeight, width: canvasWidth },
  error: { color: "#fda4af", fontSize: 22, marginTop: 14 },
  eyebrow: { color: "#fde68a", fontSize: 18, fontWeight: "700", letterSpacing: 3.5 },
  frame: {
    alignSelf: "center",
    borderColor: "#7c3aed",
    borderRadius: 34,
    borderWidth: 2,
    height: canvasHeight,
    marginTop: 24,
    overflow: "hidden",
    width: canvasWidth,
  },
  label: { left: 52, position: "absolute", top: 40 },
  subtitle: { color: "#fef3c7", fontSize: 22, marginTop: 8 },
  title: { color: "#fff", fontSize: 52, fontWeight: "800", marginTop: 8 },
});
