import { useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { AlphaType, ColorType, ImageFormat, Skia } from "@shopify/react-native-skia";
import { PixelRatio, Platform, View } from "react-native";
import { Canvas, type CanvasRef, type RNCanvasContext } from "react-native-webgpu";
import { makeMutable, runOnJS, runOnUI, useAnimatedReaction, useFrameCallback, useSharedValue, type SharedValue } from "react-native-reanimated";
import { PresentationCanvasScaleContext, useBackgroundIntensity, useBackgroundSize, usePresentationValue, usePlayback, samplePlayback, usePreparationTask, type GPURenderGraphDefinition, type GPUShaderProps } from "@legend-apps/presentation";
import { prepareRenderGraph, encodeRenderGraph, type RenderGraphResources } from "./gpuRenderGraph";
import { reportSlideError } from "./slidesStore";
import { SurfaceStillContext, type SurfaceStillRequest } from "./SlideCaptureContext";

// A navigation reaches the surface over two commits and a UI mapper flush; a still waits them out.
const STILL_SETTLE_MS = 150;

let nextGPUResourceId = 0;
type Resources = {
  id: number;
  alive: SharedValue<boolean>;
  disposed: SharedValue<boolean>;
  configured: SharedValue<boolean>;
  device: GPUDevice;
  context: RNCanvasContext;
  format: GPUTextureFormat;
  clock: GPUBuffer;
  states: GPUBuffer[];
  groups: GPUBindGroup[];
  compute?: GPUComputePipeline;
  render?: GPURenderPipeline;
  graph?: SharedValue<RenderGraphResources>;
  particles?: GPURenderPipeline;
  frameData?: GPUBuffer;
  composite?: { pipeline: GPURenderPipeline; group: GPUBindGroup; texture: GPUTexture };
  readable?: boolean;
};
type StillTarget = { buffer: GPUBuffer; bytesPerRow: number };

/** TypeGPU resolves code once; native GPU handles cross to the host-compiled UI worklet. */
export function TypeGPUShader({ code, width: configuredWidth = 1696, height: configuredHeight = 650, background = false,
  particles = false, particleCount = 256, particleVertexCount = 6, particleBlend = "additive", previewTime = 4,
  clock: clockMode = "step", image, composite = false, frameData, frameDataSize = 0, borderRadius,
  accessibilityLabel, active = true, children, maxTime, frameTimeIndex, renderGraph, renderScale }: GPUShaderProps) {
  const size = useBackgroundSize();
  const intensity = useBackgroundIntensity();
  const stillRequest = useContext(SurfaceStillContext);
  const still = background && renderGraph ? stillRequest : null;
  const readable = !!still;
  const stillId = still?.id;
  useLayoutEffect(() => { if (stillId) still?.announce(); }, [still, stillId]);
  const displayScale = useContext(PresentationCanvasScaleContext);
  const width = background ? Math.max(1, Math.round(size.width)) : configuredWidth;
  const height = background ? Math.max(1, Math.round(size.height)) : configuredHeight;
  const brightness = background ? intensity : 1;
  const canvas = useRef<CanvasRef>(null);
  // Native getContext() returns a new wrapper per call, each with its own canvas size, so one wrapper both sizes and renders.
  const context = useRef<RNCanvasContext | null>(null);
  const surfaceContext = () => {
    if (!context.current) context.current = canvas.current?.getContext("webgpu") ?? null;
    return context.current;
  };
  const supported = typeof navigator !== "undefined" && !!navigator.gpu;
  const [resources, setResources] = useState<Resources>();
  const [preparedResources, setPreparedResources] = useState<Resources>();
  const [error, setError] = useState<string>();
  usePreparationTask(supported && !error && (!resources || preparedResources !== resources));
  const slideIndex = usePresentationValue("slideIndex");
  const isPreview = usePresentationValue("isPreview");
  const errorContext = useRef({ slideIndex, isPreview });
  useLayoutEffect(() => { errorContext.current = { slideIndex, isPreview }; }, [slideIndex, isPreview]);
  // Surface dimensions are independent of shader/device ownership. In particular,
  // live window resizing must not recompile pipelines or reset simulation buffers.
  useLayoutEffect(() => {
    const surface = surfaceContext()?.canvas;
    if (surface) resizeSurface(surface, width, height, displayScale);
  }, [width, height, displayScale, resources]);
  useEffect(() => {
    if (!supported) return;
    return startShaderCanvas({ readable, canvas, surfaceContext, code, particles, particleCount, particleBlend, image, composite, width, height, displayScale, frameDataSize, renderGraph,
      reportError: caught => reportSlideError(caught, errorContext.current.slideIndex, errorContext.current.isPreview),
      setResources, setError });
  }, [supported, code, particles, particleCount, particleBlend, image, composite, frameDataSize, renderGraph, readable]);
  if (!supported) throw new Error("WebGPU is required to render this effect");
  if (error) throw new Error(error);
  return <View accessibilityLabel={accessibilityLabel} pointerEvents="none" style={{ width, height, overflow: "hidden", borderRadius: borderRadius ?? (background ? 0 : 20) }}>
    <Canvas ref={canvas} style={{ width, height }} />
    {resources && <UIFrames key={resources.id} resources={resources} still={still} renderScale={renderScale} effectActive={active} maxTime={maxTime} frameTimeIndex={frameTimeIndex} displayScale={displayScale} width={width} height={height} aspect={width/height} brightness={brightness} particleCount={particleCount} particleVertexCount={particleVertexCount} clockMode={clockMode} frameData={frameData} previewTime={previewTime} onError={message => { setError(message); reportSlideError(message, errorContext.current.slideIndex, errorContext.current.isPreview); }} onReady={() => setPreparedResources(resources)} />}
    {resources && children}
  </View>;
}

/** Back the drawable at device pixels, the slide's display scale times the screen's backing scale. */
function resizeSurface(surface: { width: number; height: number }, width: number, height: number, displayScale: number) {
  const pixelWidth = Math.max(1, Math.round(width * displayScale * PixelRatio.get()));
  const pixelHeight = Math.max(1, Math.round(height * displayScale * PixelRatio.get()));
  if (surface.width !== pixelWidth) surface.width = pixelWidth;
  if (surface.height !== pixelHeight) surface.height = pixelHeight;
}

// Dawn's event pump runs on JS even after frame rendering transfers to the UI
// runtime. Both threads can submit pending Metal work, so device locking is
// required. Never retry without it: unsupported adapters must fail safely.
function requestShaderDevice(adapter: GPUAdapter): Promise<GPUDevice> {
  if (Platform.OS === "web") return adapter.requestDevice();
  return adapter.requestDevice({
    requiredFeatures: ["implicit-device-synchronization" as GPUFeatureName],
  });
}

// Setup stays outside React compilation; the UI renderer owns transferred handles.
function startShaderCanvas({ readable, canvas, surfaceContext, code, particles, particleCount, particleBlend = "additive", image, composite = false, width = 1696, height = 650, displayScale = 1, frameDataSize = 0, renderGraph, reportError, setResources, setError }: {
  readable: boolean; canvas: RefObject<CanvasRef | null>; surfaceContext(): RNCanvasContext | null; code: string; renderGraph?: GPURenderGraphDefinition;
  particles: boolean; particleCount: number; particleBlend?: "additive" | "over"; image?: string; composite?: boolean;
  width?: number; height?: number; displayScale?: number; frameDataSize?: number; reportError(error: unknown): void;
  setResources(resources: Resources | undefined): void; setError(error: string | undefined): void;
}) {
    setResources(undefined);
    setError(undefined);
    let cancelled = false;
    let device: GPUDevice | undefined;
    // Once transferred, the UI renderer owns teardown after its last frame.
    let transferred = false;
    let release: (() => void) | undefined;
    let validationScope = false;
    async function setup() {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No WebGPU adapter");
        device = await requestShaderDevice(adapter);
        if (cancelled || !canvas.current) { device.destroy(); return; }
        device.addEventListener("uncapturederror", event => {
          event.preventDefault();
          if (!cancelled) { setError(event.error.message); reportError(event.error); }
        });
        device.pushErrorScope("validation");
        validationScope = true;
        void device.lost.then(info => {
          if (!cancelled && info.reason !== "destroyed") setError("WebGPU device lost: " + info.message);
        });
        const context = surfaceContext();
        if (!context) throw new Error("WebGPU surface unavailable");
        // The library sizes from view bounds in points (zero during preparation on web).
        // Set the drawing buffer in device pixels before transferring ownership to UIFrames.
        resizeSurface(context.canvas, width, height, displayScale);
        const format = navigator.gpu.getPreferredCanvasFormat();
        if (renderGraph) {
          const clock = device.createBuffer({ size: 32, usage: 64 | 8 });
          const frameData = device.createBuffer({ size: Math.max(16, frameDataSize * 4), usage: 128 | 8 });
          const graph = await prepareRenderGraph(device, renderGraph, format, clock, frameData);
          await transfer({ device, context, format, clock, frameData, graph, states: [], groups: [] });
          return;
        }
        const fieldFormat = composite ? "rgba16float" : format;
        const module = device.createShaderModule({ code });
        const diagnostics = await module.getCompilationInfo();
        const errors = diagnostics.messages.filter(message => message.type === "error");
        if (errors.length) throw new Error(errors.map(message => message.message).join("\n"));
        if (cancelled) throw new Error("GPU setup cancelled");
        let imageTexture: GPUTexture | undefined;
        if (image) {
          imageTexture = await loadImageTexture(device, image);
          if (cancelled) throw new Error("GPU setup cancelled");
        }
        const sampler = imageTexture || composite ? device.createSampler({ minFilter: "linear", magFilter: "linear" }) : undefined;
        const frameData = frameDataSize ? device.createBuffer({ size: frameDataSize * 4, usage: 128 | 8 }) : undefined;
        const simulates = /@compute\b/.test(code);
        const layout = device.createBindGroupLayout({ entries: [
          { binding: 0, visibility: 7, buffer: { type: "uniform" } },
          ...(simulates ? [
            { binding: 1, visibility: 7, buffer: { type: "read-only-storage" as const } },
            { binding: 2, visibility: 4, buffer: { type: "storage" as const } },
          ] : []),
          ...(imageTexture ? [ { binding: 3, visibility: 2, sampler: {} }, { binding: 4, visibility: 2, texture: {} } ] : []),
          ...(frameData ? [ { binding: 5, visibility: 3, buffer: { type: "read-only-storage" as const } } ] : []),
        ] });
        const compositeLayout = composite ? device.createBindGroupLayout({ entries: [
          { binding: 0, visibility: 2, sampler: {} }, { binding: 1, visibility: 2, texture: {} },
        ] }) : undefined;
        const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
        const clock = device.createBuffer({ size: 32, usage: 64 | 8 });
        const states = simulates ? [0, 1].map(() => device!.createBuffer({ size: particleCount * 16, usage: 128 | 8 })) : [];
        const groups = (simulates ? [0, 1] : [0]).map(index => device!.createBindGroup({ layout, entries: [
          { binding: 0, resource: { buffer: clock } },
          ...(simulates ? [
            { binding: 1, resource: { buffer: states[index] } },
            { binding: 2, resource: { buffer: states[1-index] } },
          ] : []),
          ...(imageTexture ? [ { binding: 3, resource: sampler! }, { binding: 4, resource: imageTexture.createView() } ] : []),
          ...(frameData ? [ { binding: 5, resource: { buffer: frameData } } ] : []),
        ] }));
        const compute = simulates ? device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: "simulate" } }) : undefined;
        const render = device.createRenderPipeline({ layout: pipelineLayout,
          vertex: { module, entryPoint: "vertexMain" }, fragment: { module, entryPoint: "fragmentMain", targets: [{ format: fieldFormat }] } });
        const particlePipeline = particles ? device.createRenderPipeline({ layout: pipelineLayout,
          vertex: { module, entryPoint: "particleVertex" },
          fragment: { module, entryPoint: "particleFragment", targets: [{ format: fieldFormat, blend: {
            color: { srcFactor: "one", dstFactor: particleBlend === "over" ? "one-minus-src-alpha" : "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          } }] } }) : undefined;
        let compositeResources: Resources["composite"];
        if (compositeLayout) {
          // Render at logical slide resolution; resizing the presentation camera
          // changes only the output surface, never this field's simulation.
          const texture = device.createTexture({ size: [width, height], format: fieldFormat, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          const group = device.createBindGroup({ layout: compositeLayout, entries: [
            { binding: 0, resource: sampler! }, { binding: 1, resource: texture.createView() },
          ] });
          const pipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [layout, compositeLayout] }),
            vertex: { module, entryPoint: "vertexMain" }, fragment: { module, entryPoint: "compositeFragment", targets: [{ format }] },
          });
          compositeResources = { pipeline, group, texture };
        }
        await transfer({ device, context, format, clock, states, groups, compute, render, particles: particlePipeline, frameData, composite: compositeResources });
      } catch (caught) {
        if (validationScope) {
          validationScope = false;
          await device?.popErrorScope().catch(() => {});
        }
        device?.destroy();
        if (!cancelled) { setError(caught instanceof Error ? caught.message : String(caught)); reportError(caught); }
      }
    }
    async function transfer(program: Omit<Resources, "alive" | "disposed" | "configured" | "id" | "graph"> & { graph?: RenderGraphResources }) {
      validationScope = false;
      const validationError = await program.device.popErrorScope();
      if (validationError) throw new Error(validationError.message);
      if (cancelled) { program.device.destroy(); return; }
      const alive = makeMutable(true), disposed = makeMutable(false), configured = makeMutable(false);
      release = () => runOnUI(destroyGPU)(program.device, alive, disposed);
      transferred = true;
      setResources({ ...program, readable, graph: program.graph ? makeMutable(program.graph) : undefined, alive, disposed, configured, id: ++nextGPUResourceId });
    }
    void setup();
    return () => { cancelled = true; if (release) release(); else if (!transferred) device?.destroy(); };
}

function UIFrames({ resources: r, still, renderScale, effectActive = true, maxTime, frameTimeIndex, displayScale = 1, width, height, aspect, brightness, particleCount, particleVertexCount = 6, clockMode = "step", frameData, previewTime, onError, onReady }: { resources: Resources; still: SurfaceStillRequest | null; renderScale?: SharedValue<number>; effectActive?: boolean; maxTime?:number; frameTimeIndex?:number; displayScale?:number; width: number; height: number; aspect: number; brightness: number; particleCount: number; particleVertexCount?: number; clockMode?: "slide" | "step"; frameData?: SharedValue<number[] | Float32Array<ArrayBuffer>>; previewTime: number; onError(message: string): void; onReady(): void }) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const preparing = usePresentationValue("isPreparing");
  const step = usePresentationValue("stepIndex");
  const playback = usePlayback();
  const { alive, disposed } = r;
  const count = useSharedValue(0);
  const rendered = useSharedValue(false);
  const finished = useSharedValue(false);
  const simulationEpoch = useSharedValue({ phase: "", slideKey: "", stepKey: "" });
  const { device, context, clock, groups, compute, render, particles } = r;
  const draw = (dt: number, frozen = false, stillTarget?: StillTarget) => {
    "worklet";
    if (!alive.value) return;
    const state = playback.value;
    const previous = simulationEpoch.value;
    if (state.phase !== "outgoing" && state.phase !== "paused" &&
        (previous.slideKey !== state.slideKey || previous.stepKey !== state.stepKey ||
         (state.phase === "playing" && previous.phase !== "playing"))) {
      count.value = 0;
    }
    if (previous.phase !== state.phase || previous.slideKey !== state.slideKey || previous.stepKey !== state.stepKey) {
      simulationEpoch.value = { phase: state.phase, slideKey: state.slideKey, stepKey: state.stepKey };
    }
    const frameIndex = frozen ? Math.max(0, count.value - 1) : count.value;
    const scale = renderScale?.get();
    try {
      const time = samplePlayback(state, previewTime, clockMode);
      const values = scratch(8);
      values[0] = time; values[1] = dt; values[2] = frameIndex; values[3] = state.stepIndex; values[4] = aspect; values[5] = brightness;
      values[6] = samplePlayback(state, previewTime, "slide"); values[7] = samplePlayback(state, previewTime, "step");
      device.queue.writeBuffer(clock, 0, values);
      submitGPUFrame(r, frameIndex, particleCount, particleVertexCount, frameData, scale, stillTarget);
      if (!frozen) count.value += 1;
      if (!rendered.value) { rendered.value = true; runOnJS(onReady)(); }
    } catch (caught) {
      alive.set(false);
      runOnJS(onError)(String(caught));
    }
  };
  const scaleInputs = r.graph && renderScale ? { scale: renderScale, uniforms: frameData } : null;
  // Order a frozen redraw after the uniform mapper has sampled the same scale.
  useAnimatedReaction(() => scaleInputs ? { scale: scaleInputs.scale.value, uniforms: scaleInputs.uniforms?.value } : null, (snapshot, previous) => {
    if (snapshot && previous && snapshot.scale !== previous.scale && rendered.value && playback.value.phase !== "playing") draw(0, true);
  });
  const frame = useFrameCallback(info => {
    if (!effectActive || playback.value.phase !== "playing") return;
    const state=playback.value, previous=simulationEpoch.value;
    if (finished.value && previous.slideKey===state.slideKey && previous.stepKey===state.stepKey && previous.phase==="playing") return;
    // Clamp only the simulation integration delta; visual time comes from the
    // shared wall clock and must not slow down when a frame is delayed.
    draw(Math.min(info.timeSincePreviousFrame ?? 0, 40)/1000);
    const time=frameTimeIndex===undefined ? samplePlayback(state,previewTime,clockMode) : frameData?.value[frameTimeIndex];
    finished.value=maxTime!==undefined && time!==undefined && time>=maxTime;
  }, false);
  useEffect(() => {
    frame.setActive(effectActive && active && !preview && !preparing);
    runOnUI(() => {
      "worklet";
      const phase = playback.value.phase;
      if (phase === "playing") finished.value=false;
      if (phase === "preview" || phase === "preparing") { finished.value=false; count.value = 0; draw(0); }
      else if (phase === "playing" && (!rendered.value || !effectActive)) draw(0);
      else if (r.graph && rendered.value && (phase === "paused" || phase === "outgoing")) draw(0, true);
    })();
    return () => frame.setActive(false);
  }, [active, effectActive, maxTime, frameTimeIndex, preview, preparing, previewTime, step, frame, rendered, finished, brightness, playback, displayScale, width, height, clockMode, frameData, renderScale, particleVertexCount]);
  const stillId = still?.id;
  useEffect(() => {
    if (!still || !stillId) return;
    const timer = setTimeout(() => {
      const { width, height } = r.context.canvas;
      const bytesPerRow = (width * 4 + 255) & ~255;
      const buffer = r.device.createBuffer({ size: bytesPerRow * height, usage: 1 | 8 });
      const finish = () => { void encodeStill(buffer, width, height, bytesPerRow, r.format).then(uri => still.deliver(stillId, uri), error => onError(String(error))); };
      runOnUI(() => {
        "worklet";
        draw(0, false, { buffer, bytesPerRow });
        runOnJS(finish)();
      })();
    }, STILL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [still, stillId]);
  useEffect(() => () => {
    // Queue destruction behind the final UI frame, never race a submitted callback.
    runOnUI(destroyGPU)(device, alive, disposed);
  }, [alive, disposed, device]);
  return null;
}


async function encodeStill(buffer: GPUBuffer, width: number, height: number, bytesPerRow: number, format: GPUTextureFormat) {
  await buffer.mapAsync(1);
  const data = Skia.Data.fromBytes(new Uint8Array(buffer.getMappedRange()).slice());
  buffer.destroy();
  const image = Skia.Image.MakeImage({ width, height, colorType: format.startsWith("bgra") ? ColorType.BGRA_8888 : ColorType.RGBA_8888, alphaType: AlphaType.Premul }, data, bytesPerRow);
  data.dispose();
  if (!image) throw new Error("Could not encode a slide still");
  try { return `data:image/jpeg;base64,${image.encodeToBase64(ImageFormat.JPEG, 90)}`; }
  finally { image.dispose(); }
}

/** writeBuffer copies synchronously, so surfaces on the UI runtime share one exact-length staging array per size. */
function scratch(length: number) {
  "worklet";
  const runtime = globalThis as { __gpuScratch?: Record<number, Float32Array<ArrayBuffer>> };
  const arrays = runtime.__gpuScratch ??= {};
  return arrays[length] ??= new Float32Array(length);
}

function destroyGPU(device: GPUDevice, alive: SharedValue<boolean>, disposed: SharedValue<boolean>) {
  "worklet";
  alive.value = false;
  if (!disposed.value) {
    disposed.value = true;
    device.destroy();
  }
}

// Native Skia's URI loader supports deck-local file URLs. Decode once during
// preparation; the UI runtime receives only the uploaded GPU texture.
async function loadImageTexture(device: GPUDevice, uri: string) {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Could not load GPU image: " + response.status);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const texture = device.createTexture({ size: [bitmap.width, bitmap.height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture, premultipliedAlpha: true }, [bitmap.width, bitmap.height]);
      return texture;
    } finally { bitmap.close(); }
  }
  const data = await Skia.Data.fromURI(uri);
  try {
    const image = Skia.Image.MakeImageFromEncoded(data);
    if (!image) throw new Error("Could not decode GPU image");
    try {
      const width = image.width(), height = image.height();
      const pixels = image.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Premul });
      if (!(pixels instanceof Uint8Array)) throw new Error("Could not read GPU image pixels");
      const texture = device.createTexture({ size: [width, height], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      device.queue.writeTexture({ texture }, pixels.buffer, { offset: pixels.byteOffset, bytesPerRow: width * 4 }, [width, height]);
      return texture;
    } finally { image.dispose(); }
  } finally { data.dispose(); }
}

function submitGPUFrame(r: Resources, frame: number, particleCount: number, particleVertexCount: number, frameData?: SharedValue<number[] | Float32Array<ArrayBuffer>>, renderScale = 1, still?: StillTarget) {
  "worklet";
  const { device, context, clock, groups, compute, render, particles } = r;
  // Configure on UI after retirement of the previous owner, never during async setup.
  if (!r.configured.value) {
    context.configure({ device, format: r.format, alphaMode: "premultiplied", ...(r.readable ? { usage: 16 | 1 } : {}) });
    r.configured.value = true;
  }
  const data = frameData?.value;
  if (r.frameData && data) {
    if (data.length * 4 > r.frameData.size) throw new Error(`Frame data has ${data.length} values; its buffer holds ${r.frameData.size / 4}`);
    let values = data;
    if (!(values instanceof Float32Array)) { values = scratch(data.length); values.set(data); }
    device.queue.writeBuffer(r.frameData, 0, values);
  }
  const encoder = device.createCommandEncoder();
  if (r.graph) {
    const screen = context.getCurrentTexture();
    encodeRenderGraph(r.graph.value, device, encoder, screen, renderScale, data);
    if (still) encoder.copyTextureToBuffer({ texture: screen }, { buffer: still.buffer, bytesPerRow: still.bytesPerRow }, [screen.width, screen.height]);
    device.queue.submit([encoder.finish()]); context.present();
    return;
  }
  const source = compute ? frame % 2 : 0;
  const target = compute ? 1-source : 0;
  if (compute && particleCount > 0) {
    const simulation = encoder.beginComputePass();
    simulation.setPipeline(compute); simulation.setBindGroup(0, groups[source]);
    simulation.dispatchWorkgroups(Math.ceil(particleCount / 64)); simulation.end();
  }
  const pass = encoder.beginRenderPass({ colorAttachments: [{
    view: r.composite ? r.composite.texture.createView() : context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 },
    loadOp: "clear", storeOp: "store",
  }] });
  pass.setBindGroup(0, groups[target]);
  pass.setPipeline(render!); pass.draw(3);
  if (particles && particleCount > 0 && particleVertexCount > 0) { pass.setPipeline(particles); pass.draw(particleVertexCount, particleCount); }
  pass.end();
  if (r.composite) {
    const compositePass = encoder.beginRenderPass({ colorAttachments: [{
      view: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store",
    }] });
    compositePass.setPipeline(r.composite.pipeline);
    compositePass.setBindGroup(0, groups[target]); compositePass.setBindGroup(1, r.composite.group);
    compositePass.draw(3); compositePass.end();
  }
  device.queue.submit([encoder.finish()]); context.present();
}
