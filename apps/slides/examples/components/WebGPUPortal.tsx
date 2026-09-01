import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useRef, useState } from "react";
import { PixelRatio, StyleSheet, Text, View } from "react-native";
import { Canvas, type CanvasRef } from "react-native-webgpu";

const canvasWidth = 1500;
const canvasHeight = 560;
const particleCount = 65_536;
const particleStride = 8;
const workgroupSize = 256;

const backgroundShader = `
  struct Uniforms {
    resolution: vec2f,
    time: f32,
    delta: f32,
  }

  @group(0) @binding(0) var<uniform> uniforms: Uniforms;

  fn hash21(position: vec2f) -> f32 {
    let value = dot(position, vec2f(127.1, 311.7));
    return fract(sin(value) * 43758.5453);
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
    let uv = (position.xy * 2.0 - uniforms.resolution)
      / min(uniforms.resolution.x, uniforms.resolution.y);
    let radius = length(uv);
    let angle = atan2(uv.y, uv.x);
    let lens = 0.028 / max(abs(radius - 0.24), 0.018);
    let spiral = sin(angle * 5.0 - radius * 18.0 + uniforms.time * 0.8);
    let dust = exp(-abs(uv.y + spiral * 0.035) * 17.0)
      * (1.0 - smoothstep(0.18, 1.45, radius));
    let horizonGlow = 0.018 / max(abs(radius - 0.235), 0.012);
    let jet = exp(-abs(uv.x) * 28.0)
      * smoothstep(0.18, 0.48, abs(uv.y))
      * (1.0 - smoothstep(0.32, 1.45, abs(uv.y)));
    let starCell = floor((uv + vec2f(uniforms.time * 0.006, 0.0)) * 145.0);
    let star = pow(hash21(starCell), 46.0) * smoothstep(0.22, 0.55, radius);

    var color = vec3f(0.002, 0.004, 0.018);
    color += vec3f(0.025, 0.11, 0.3) * lens * 0.18;
    color += mix(vec3f(0.08, 0.24, 0.9), vec3f(1.0, 0.08, 0.5), spiral * 0.5 + 0.5)
      * dust * 0.24;
    color += vec3f(0.2, 0.75, 1.0) * horizonGlow * 0.12;
    color += vec3f(0.03, 0.35, 0.95) * jet * (0.35 + 0.25 * sin(uniforms.time * 2.0));
    color += vec3f(star);
    color *= smoothstep(0.16, 0.245, radius);
    return vec4f(color, 1.0);
  }
`;

const computeShader = `
  struct Particle {
    position: vec4f,
    velocity: vec4f,
  }

  struct Uniforms {
    resolution: vec2f,
    time: f32,
    delta: f32,
  }

  @group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
  @group(0) @binding(1) var<uniform> uniforms: Uniforms;

  fn hash(value: f32) -> f32 {
    return fract(sin(value * 91.3458 + 17.123) * 47453.5453);
  }

  @compute @workgroup_size(${workgroupSize})
  fn computeMain(@builtin(global_invocation_id) invocation: vec3u) {
    let index = invocation.x;
    if (index >= ${particleCount}u) {
      return;
    }

    var particle = particles[index];
    var position = particle.position.xyz;
    var velocity = particle.velocity.xyz;
    let seed = particle.velocity.w;
    let radius = max(length(position.xz), 0.02);
    let radial = position.xz / radius;
    let tangent = vec2f(-radial.y, radial.x);
    let gravity = -radial * (0.18 / (radius * radius + 0.08));
    let orbit = tangent * (0.32 / sqrt(radius + 0.12));
    let turbulence = vec2f(
      sin(position.z * 5.0 - uniforms.time * 1.7 + seed * 20.0),
      cos(position.x * 4.0 + uniforms.time * 1.3 + seed * 13.0)
    ) * 0.045;

    let planarVelocity = velocity.xz + (gravity + orbit + turbulence) * uniforms.delta;
    let verticalVelocity = velocity.y
      + (-position.y * 1.8 + sin(seed * 40.0 + uniforms.time * 2.0) * 0.025)
        * uniforms.delta;
    velocity = vec3f(planarVelocity.x, verticalVelocity, planarVelocity.y);
    velocity *= exp(-0.28 * uniforms.delta);
    position += velocity * uniforms.delta;

    let nextRadius = length(position.xz);
    if (nextRadius < 0.19 || nextRadius > 3.4) {
      let cycle = floor(uniforms.time * 0.22) + seed * 103.0;
      let resetAngle = hash(cycle + 2.7) * 6.2831853;
      let resetRadius = 2.35 + hash(cycle + 8.1) * 0.7;
      let resetSpeed = 0.18 + hash(cycle + 13.4) * 0.11;
      position = vec3f(
        cos(resetAngle) * resetRadius,
        (hash(cycle + 21.8) - 0.5) * 0.22,
        sin(resetAngle) * resetRadius
      );
      velocity = vec3f(
        -sin(resetAngle) * resetSpeed,
        0.0,
        cos(resetAngle) * resetSpeed
      );
    }

    particle.position = vec4f(position, particle.position.w);
    particle.velocity = vec4f(velocity, seed);
    particles[index] = particle;
  }
`;

const particleShader = `
  struct Particle {
    position: vec4f,
    velocity: vec4f,
  }

  struct Uniforms {
    resolution: vec2f,
    time: f32,
    delta: f32,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) local: vec2f,
    @location(1) color: vec3f,
    @location(2) intensity: f32,
  }

  @group(0) @binding(0) var<storage, read> particles: array<Particle>;
  @group(0) @binding(1) var<uniform> uniforms: Uniforms;

  @vertex
  fn vertexMain(
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
  ) -> VertexOutput {
    var corners = array<vec2f, 6>(
      vec2f(-1.0, -1.0),
      vec2f(1.0, -1.0),
      vec2f(-1.0, 1.0),
      vec2f(-1.0, 1.0),
      vec2f(1.0, -1.0),
      vec2f(1.0, 1.0)
    );
    let particle = particles[instanceIndex];
    let corner = corners[vertexIndex];
    let cameraAngle = uniforms.time * 0.035;
    let cameraCos = cos(cameraAngle);
    let cameraSin = sin(cameraAngle);
    let orbitPosition = vec2f(
      particle.position.x * cameraCos - particle.position.z * cameraSin,
      particle.position.x * cameraSin + particle.position.z * cameraCos
    );
    let radius = length(particle.position.xz);
    let depth = orbitPosition.y;
    let perspective = 1.0 / (1.0 + depth * 0.055);
    let center = vec2f(
      orbitPosition.x * 0.37,
      (particle.position.y + depth * 0.255) * 0.78
    ) * perspective;
    let speed = length(particle.velocity.xyz);
    let flare = 5.0 + clamp(speed * 13.0, 0.0, 11.0)
      + 3.0 * sin(particle.velocity.w * 90.0 + uniforms.time * 3.0);
    let offset = corner * flare * 2.0 / uniforms.resolution;
    let heat = 1.0 - smoothstep(0.28, 2.4, radius);
    let coldColor = vec3f(0.03, 0.45, 1.0);
    let hotColor = vec3f(1.0, 0.08, 0.48);
    let coreColor = vec3f(1.0, 0.72, 0.2);

    var output: VertexOutput;
    output.position = vec4f(center + offset, depth * 0.0001, 1.0);
    output.local = corner;
    output.color = mix(mix(coldColor, hotColor, heat), coreColor, heat * heat);
    output.intensity = 0.48 + heat * 1.4;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let radius = length(input.local);
    let softCore = exp(-radius * radius * 5.5);
    let halo = (1.0 - smoothstep(0.0, 1.0, radius)) * 0.22;
    let alpha = (softCore + halo) * input.intensity;
    return vec4f(input.color * alpha, alpha);
  }
`;

function createInitialParticles() {
  const particles = new Float32Array(particleCount * particleStride);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < particleCount; index++) {
    const seed = ((index * 16_807) % 2_147_483_647) / 2_147_483_647;
    const angle = index * goldenAngle + seed * 0.8;
    const radius = 0.28 + Math.sqrt((index + 0.5) / particleCount) * 2.72;
    const speed = 0.16 + 0.24 / Math.sqrt(radius + 0.12);
    const offset = index * particleStride;

    particles[offset] = Math.cos(angle) * radius;
    particles[offset + 1] = (seed - 0.5) * 0.2 * (radius / 3);
    particles[offset + 2] = Math.sin(angle) * radius;
    particles[offset + 3] = 1;
    particles[offset + 4] = -Math.sin(angle) * speed;
    particles[offset + 5] = 0;
    particles[offset + 6] = Math.cos(angle) * speed;
    particles[offset + 7] = seed;
  }

  return particles;
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
        if (!bufferUsage) {
          throw new Error("WebGPU buffer constants are not available.");
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

        const uniformBuffer = device.createBuffer({
          size: 16,
          usage: bufferUsage.COPY_DST | bufferUsage.UNIFORM,
        });
        const particleBuffer = device.createBuffer({
          size: particleCount * particleStride * Float32Array.BYTES_PER_ELEMENT,
          usage: bufferUsage.COPY_DST | bufferUsage.STORAGE,
        });
        device.queue.writeBuffer(particleBuffer, 0, createInitialParticles());

        const backgroundModule = device.createShaderModule({ code: backgroundShader });
        const computeModule = device.createShaderModule({ code: computeShader });
        const particleModule = device.createShaderModule({ code: particleShader });
        const [backgroundPipeline, computePipeline, particlePipeline] = await Promise.all([
          device.createRenderPipelineAsync({
            fragment: { entryPoint: "fragmentMain", module: backgroundModule, targets: [{ format }] },
            layout: "auto",
            primitive: { topology: "triangle-list" },
            vertex: { entryPoint: "vertexMain", module: backgroundModule },
          }),
          device.createComputePipelineAsync({
            compute: { entryPoint: "computeMain", module: computeModule },
            layout: "auto",
          }),
          device.createRenderPipelineAsync({
            fragment: {
              entryPoint: "fragmentMain",
              module: particleModule,
              targets: [{
                blend: {
                  alpha: { dstFactor: "one", operation: "add", srcFactor: "one" },
                  color: { dstFactor: "one", operation: "add", srcFactor: "one" },
                },
                format,
              }],
            },
            layout: "auto",
            primitive: { topology: "triangle-list" },
            vertex: { entryPoint: "vertexMain", module: particleModule },
          }),
        ]);
        const backgroundBindGroup = device.createBindGroup({
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
          layout: backgroundPipeline.getBindGroupLayout(0),
        });
        const computeBindGroup = device.createBindGroup({
          entries: [
            { binding: 0, resource: { buffer: particleBuffer } },
            { binding: 1, resource: { buffer: uniformBuffer } },
          ],
          layout: computePipeline.getBindGroupLayout(0),
        });
        const particleBindGroup = device.createBindGroup({
          entries: [
            { binding: 0, resource: { buffer: particleBuffer } },
            { binding: 1, resource: { buffer: uniformBuffer } },
          ],
          layout: particlePipeline.getBindGroupLayout(0),
        });

        const startedAt = performance.now();
        let previousTime = startedAt;
        const render = (now: number) => {
          if (cancelled || !device) {
            return;
          }
          const time = isPreview ? 5.5 : (now - startedAt) / 1_000;
          const delta = isPreview ? 0 : Math.min((now - previousTime) / 1_000, 1 / 30);
          previousTime = now;
          device.queue.writeBuffer(
            uniformBuffer,
            0,
            new Float32Array([surface.width, surface.height, time, delta]),
          );

          const encoder = device.createCommandEncoder();
          if (!isPreview) {
            const computePass = encoder.beginComputePass();
            computePass.setPipeline(computePipeline);
            computePass.setBindGroup(0, computeBindGroup);
            computePass.dispatchWorkgroups(Math.ceil(particleCount / workgroupSize));
            computePass.end();
          }

          const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
              clearValue: { a: 1, b: 0.012, g: 0.003, r: 0.001 },
              loadOp: "clear",
              storeOp: "store",
              view: context.getCurrentTexture().createView(),
            }],
          });
          renderPass.setPipeline(backgroundPipeline);
          renderPass.setBindGroup(0, backgroundBindGroup);
          renderPass.draw(3);
          renderPass.setPipeline(particlePipeline);
          renderPass.setBindGroup(0, particleBindGroup);
          renderPass.draw(6, particleCount);
          renderPass.end();
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
        <Text style={styles.eyebrow}>METAL COMPUTE • 65,536 PARTICLES</Text>
        <Text style={styles.title}>Singularity Engine</Text>
        <Text style={styles.subtitle}>Every point is simulated and rendered on the GPU</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { height: canvasHeight, width: canvasWidth },
  error: { color: "#fda4af", fontSize: 24, marginTop: 14 },
  eyebrow: { color: "#7dd3fc", fontSize: 20, fontWeight: "700", letterSpacing: 4 },
  frame: {
    alignSelf: "center",
    borderColor: "#334155",
    borderRadius: 34,
    borderWidth: 2,
    height: canvasHeight,
    marginTop: 24,
    overflow: "hidden",
    width: canvasWidth,
  },
  label: { left: 52, position: "absolute", top: 40 },
  subtitle: { color: "#94a3b8", fontSize: 22, marginTop: 8 },
  title: { color: "#fff", fontSize: 48, fontWeight: "800", marginTop: 8 },
});
