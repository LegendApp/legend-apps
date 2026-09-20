import { useEffect, useRef, useState, type RefObject } from "react";
import { Text, View } from "react-native";
import { Canvas, type CanvasRef, type RNCanvasContext } from "react-native-webgpu";
import { makeMutable, runOnJS, runOnUI, useFrameCallback, useSharedValue, type SharedValue } from "react-native-reanimated";
import { useBackgroundIntensity, useBackgroundSize, usePresentationValue, usePlayback, samplePlayback } from "@legend-apps/presentation";
import { reportSlideError } from "./slidesStore";

type Resources = {
  alive: SharedValue<boolean>;
  disposed: SharedValue<boolean>;
  device: GPUDevice;
  context: RNCanvasContext;
  clock: GPUBuffer;
  states: GPUBuffer[];
  groups: GPUBindGroup[];
  compute: GPUComputePipeline;
  render: GPURenderPipeline;
  particles?: GPURenderPipeline;
};

/** TypeGPU resolves code once; native GPU handles cross to the host-compiled UI worklet. */
export function TypeGPUShader({ code, width: configuredWidth = 1696, height: configuredHeight = 650, background = false, particles = false, particleCount = 256, previewTime = 4 }: {
  code: string; width?: number; height?: number; background?: boolean; particles?: boolean; particleCount?: number; previewTime?: number;
}) {
  const size = useBackgroundSize();
  const intensity = useBackgroundIntensity();
  const width = background ? Math.max(1, Math.round(size.width)) : configuredWidth;
  const height = background ? Math.max(1, Math.round(size.height)) : configuredHeight;
  const brightness = background ? intensity : 1;
  const canvas = useRef<CanvasRef>(null);
  const [resources, setResources] = useState<Resources>();
  const [error, setError] = useState<string>();
  const slideIndex = usePresentationValue("slideIndex");
  useEffect(() => startShaderCanvas({ canvas, code, width, height, particles, particleCount,
    slideIndex, setResources, setError }), [code, width, height, particles, particleCount, slideIndex]);
  return <View style={{ width, height, overflow: "hidden", borderRadius: background ? 0 : 20 }}>
    <Canvas ref={canvas} style={{ width, height }} transparent />
    {resources && !error && <UIFrames key={code} resources={resources} aspect={width/height} brightness={brightness} particleCount={particleCount} previewTime={previewTime} onError={setError} />}
    {error && <Text style={{ color: "#ffb4ae", padding: 24 }}>TypeGPU preview unavailable: {error}</Text>}
  </View>;
}


// Dawn's event pump runs on JS even after frame rendering transfers to the UI
// runtime. Both threads can submit pending Metal work, so device locking is
// required. Never retry without it: unsupported adapters must fail safely.
function requestShaderDevice(adapter: GPUAdapter): Promise<GPUDevice> {
  return adapter.requestDevice({
    requiredFeatures: ["implicit-device-synchronization" as GPUFeatureName],
  });
}

// Setup stays outside React compilation; the UI renderer owns transferred handles.
function startShaderCanvas({ canvas, code, width, height, particles, particleCount, slideIndex, setResources, setError }: {
  canvas: RefObject<CanvasRef | null>; code: string; width: number; height: number;
  particles: boolean; particleCount: number; slideIndex: number;
  setResources(resources: Resources | undefined): void; setError(error: string | undefined): void;
}) {
    setResources(undefined);
    setError(undefined);
    let cancelled = false;
    let device: GPUDevice | undefined;
    // Once transferred, the UI renderer owns teardown after its last frame.
    let transferred = false;
    let release: (() => void) | undefined;
    async function setup() {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No WebGPU adapter");
        device = await requestShaderDevice(adapter);
        if (cancelled || !canvas.current) { device.destroy(); return; }
        void device.lost.then(info => {
          if (!cancelled && info.reason !== "destroyed") setError("WebGPU device lost: " + info.message);
        });
        const context = canvas.current.getContext("webgpu");
        if (!context) throw new Error("WebGPU surface unavailable");
        const surface = canvas.current.getNativeSurface();
        surface.width = width; surface.height = height;
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({ device, format, alphaMode: "premultiplied" });
        const module = device.createShaderModule({ code });
        const diagnostics = await module.getCompilationInfo();
        const errors = diagnostics.messages.filter(message => message.type === "error");
        if (errors.length) throw new Error(errors.map(message => message.message).join("\n"));
        if (cancelled) { device.destroy(); return; }
        const layout = device.createBindGroupLayout({ entries: [
          { binding: 0, visibility: 7, buffer: { type: "uniform" } },
          { binding: 1, visibility: 7, buffer: { type: "read-only-storage" } },
          { binding: 2, visibility: 4, buffer: { type: "storage" } },
        ] });
        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
        const clock = device.createBuffer({ size: 32, usage: 64 | 8 });
        const states = [0, 1].map(() => device!.createBuffer({ size: particleCount * 16, usage: 128 | 8 }));
        const groups = states.map((source, index) => device!.createBindGroup({ layout, entries: [
          { binding: 0, resource: { buffer: clock } },
          { binding: 1, resource: { buffer: source } },
          { binding: 2, resource: { buffer: states[1-index] } },
        ] }));
        const compute = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: "simulate" } });
        const render = device.createRenderPipeline({ layout: pipelineLayout,
          vertex: { module, entryPoint: "vertexMain" }, fragment: { module, entryPoint: "fragmentMain", targets: [{ format }] } });
        const particlePipeline = particles ? device.createRenderPipeline({ layout: pipelineLayout,
          vertex: { module, entryPoint: "particleVertex" },
          fragment: { module, entryPoint: "particleFragment", targets: [{ format, blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          } }] } }) : undefined;
        device.addEventListener("uncapturederror", event => {
          event.preventDefault();
          if (!cancelled) { setError(event.error.message); reportSlideError(event.error, slideIndex, false); }
        });
        const alive = makeMutable(true);
        const disposed = makeMutable(false);
        const ownedDevice = device;
        release = () => runOnUI(destroyGPU)(ownedDevice, alive, disposed);
        transferred = true;
        setResources({ alive, disposed, device, context, clock, states, groups, compute, render, particles: particlePipeline });
      } catch (caught) {
        device?.destroy();
        if (!cancelled) { setError(String(caught)); reportSlideError(caught, slideIndex, false); }
      }
    }
    void setup();
    return () => { cancelled = true; if (release) release(); else if (!transferred) device?.destroy(); };
}

function UIFrames({ resources: r, aspect, brightness, particleCount, previewTime, onError }: { resources: Resources; aspect: number; brightness: number; particleCount: number; previewTime: number; onError(message: string): void }) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const preparing = usePresentationValue("isPreparing");
  const step = usePresentationValue("stepIndex");
  const playback = usePlayback();
  const { alive, disposed } = r;
  const count = useSharedValue(0);
  const rendered = useSharedValue(false);
  const simulationEpoch = useSharedValue({ phase: "", slideKey: "", stepKey: "" });
  const { device, context, clock, groups, compute, render, particles } = r;
  const draw = (dt: number) => {
    "worklet";
    if (!alive.value) return;
    const state = playback.value;
    const previous = simulationEpoch.value;
    if (state.phase !== "outgoing" && state.phase !== "paused" &&
        (previous.slideKey !== state.slideKey || previous.stepKey !== state.stepKey ||
         (state.phase === "playing" && previous.phase !== "playing"))) {
      count.value = 0;
    }
    simulationEpoch.value = { phase: state.phase, slideKey: state.slideKey, stepKey: state.stepKey };
    try {
      const time = samplePlayback(state, previewTime, "step");
      device.queue.writeBuffer(clock, 0, new Float32Array([time, dt, count.value, state.stepIndex, aspect, brightness, 0, 0]));
      const encoder = device.createCommandEncoder();
      const source = count.value % 2;
      const simulation = encoder.beginComputePass();
      simulation.setPipeline(compute); simulation.setBindGroup(0, groups[source]);
      simulation.dispatchWorkgroups(Math.ceil(particleCount / 64)); simulation.end();
      const pass = encoder.beginRenderPass({ colorAttachments: [{
        view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear", storeOp: "store",
      }] });
      pass.setBindGroup(0, groups[1-source]);
      pass.setPipeline(render); pass.draw(3);
      if (particles) { pass.setPipeline(particles); pass.draw(6, particleCount); }
      pass.end(); device.queue.submit([encoder.finish()]); context.present();
      count.value += 1; rendered.value = true;
    } catch (caught) {
      alive.set(false);
      runOnJS(onError)(String(caught));
    }
  };
  const frame = useFrameCallback(info => {
    if (playback.value.phase !== "playing") return;
    // Clamp only the simulation integration delta; visual time comes from the
    // shared wall clock and must not slow down when a frame is delayed.
    draw(Math.min(info.timeSincePreviousFrame ?? 0, 40)/1000);
  }, false);
  useEffect(() => {
    frame.setActive(active && !preview && !preparing);
    runOnUI(() => {
      "worklet";
      const phase = playback.value.phase;
      if (phase === "preview") { count.value = 0; draw(0); }
      else if (phase === "playing" && !rendered.value) draw(0);
    })();
    return () => frame.setActive(false);
  }, [active, preview, preparing, previewTime, step, frame, rendered, brightness, playback]);
  useEffect(() => () => {
    // Queue destruction behind the final UI frame, never race a submitted callback.
    runOnUI(destroyGPU)(device, alive, disposed);
  }, [alive, disposed, device]);
  return null;
}


function destroyGPU(device: GPUDevice, alive: SharedValue<boolean>, disposed: SharedValue<boolean>) {
  "worklet";
  alive.value = false;
  if (!disposed.value) {
    disposed.value = true;
    device.destroy();
  }
}
