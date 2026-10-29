import type { GPURenderGraphDefinition } from "@legend-apps/presentation";
import { encodeRenderGraph, prepareRenderGraph } from "../../../apps/slides/src/gpuRenderGraph";

export type BenchmarkOptions = {
  definition: GPURenderGraphDefinition;
  uniformsAt: (seconds: number) => number[];
  width: number;
  height: number;
  warmup?: number;
  frames?: number;
  repetitions?: number;
  paced?: boolean;
};

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const median = (sorted[Math.floor(sorted.length / 2)] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2;
  return { medianMs: median, p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    minMs: sorted[0], maxMs: sorted[sorted.length - 1], throughputFps: 1000 / median };
}

/** Replay fixed clock samples, with optional browser cadence measurement. */
export async function benchmarkRenderGraph({ definition, uniformsAt, width, height, warmup = 30, frames = 120, repetitions = 3, paced = false }: BenchmarkOptions) {
  if (![width, height, warmup, frames, repetitions].every(Number.isInteger) || width < 1 || height < 1 || warmup < 0 || frames < 1 || repetitions < 1) {
    throw new Error("Benchmark dimensions and sample counts must be positive integers");
  }
  if (!navigator.gpu) throw new Error("WebGPU unavailable");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No WebGPU adapter");
  const timestampSupported = adapter.features.has("timestamp-query");
  const timestamps = timestampSupported && !paced;
  const device = await adapter.requestDevice({ requiredFeatures: timestamps ? ["timestamp-query"] : [] });
  const failures: string[] = [];
  device.addEventListener("uncapturederror", event => failures.push(event.error.message));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.style.cssText = "width:100%;height:auto;display:block";
  document.body.replaceChildren(canvas);
  const context = canvas.getContext("webgpu");
  if (!context) { device.destroy(); throw new Error("No WebGPU canvas context"); }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  const initial = uniformsAt(0);
  const clock = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const uniforms = device.createBuffer({ size: Math.max(16, initial.length * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const passCount = definition.passes.length;
  const query = timestamps ? device.createQuerySet({ type: "timestamp", count: passCount * 2 }) : undefined;
  const queryBytes = passCount * 16;
  const resolve = query ? device.createBuffer({ size: queryBytes, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : undefined;
  const readback = query ? device.createBuffer({ size: queryBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }) : undefined;
  const samples: { repetition: number; frame: number; seconds: number; completedMs: number; intervalMs?: number; gpuMs?: number; passes?: Record<string, number> }[] = [];
  try {
    device.pushErrorScope("validation");
    const graph = await prepareRenderGraph(device, definition, format, clock, uniforms);
    const setupError = await device.popErrorScope();
    if (setupError) throw new Error(setupError.message);
    let previousFrame: number | undefined;
    async function render(frame: number, timed: boolean) {
      const now = paced ? await new Promise<number>(resolve => requestAnimationFrame(resolve)) : undefined;
      const intervalMs = now === undefined || previousFrame === undefined ? undefined : now - previousFrame;
      previousFrame = now;
      const seconds = 2 + frame / 60;
      const start = performance.now();
      const values = uniformsAt(seconds);
      if (values.length !== initial.length) throw new Error("Benchmark uniforms changed size");
      device.queue.writeBuffer(clock, 0, new Float32Array([seconds, 1 / 60, frame, 1, width / height, 1, seconds, seconds]));
      device.queue.writeBuffer(uniforms, 0, new Float32Array(values));
      const encoder = device.createCommandEncoder();
      let index = 0;
      // This proxy adds timers around the production encoder's unmodified passes.
      const timedEncoder = query && timed ? {
        beginRenderPass(descriptor: GPURenderPassDescriptor) {
          const offset = index++ * 2;
          return encoder.beginRenderPass({ ...descriptor, timestampWrites: { querySet: query, beginningOfPassWriteIndex: offset, endOfPassWriteIndex: offset + 1 } });
        },
        beginComputePass(descriptor?: GPUComputePassDescriptor) {
          const offset = index++ * 2;
          return encoder.beginComputePass({ ...descriptor, timestampWrites: { querySet: query, beginningOfPassWriteIndex: offset, endOfPassWriteIndex: offset + 1 } });
        },
      } as GPUCommandEncoder : encoder;
      encodeRenderGraph(graph, device, timedEncoder, context!.getCurrentTexture());
      if (query && timed) {
        encoder.resolveQuerySet(query, 0, passCount * 2, resolve!, 0);
        encoder.copyBufferToBuffer(resolve!, 0, readback!, 0, queryBytes);
      }
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
      const completedMs = performance.now() - start;
      let gpuMs: number | undefined, passes: Record<string, number> | undefined;
      if (readback && timed) {
        await readback.mapAsync(GPUMapMode.READ);
        const ticks = new BigUint64Array(readback.getMappedRange());
        passes = Object.fromEntries(definition.passes.map((pass, i) => [pass.id, Number(ticks[i * 2 + 1] - ticks[i * 2]) / 1e6]));
        gpuMs = Number(ticks[passCount * 2 - 1] - ticks[0]) / 1e6;
        readback.unmap();
      }
      if (failures.length) throw new Error(failures.join("\n"));
      return { seconds, completedMs, ...(intervalMs === undefined ? {} : { intervalMs }), ...(gpuMs === undefined ? {} : { gpuMs, passes }) };
    }
    for (let frame = 0; frame < warmup; frame++) await render(frame, false);
    for (let repetition = 0; repetition < repetitions; repetition++) {
      for (let frame = 0; frame < frames; frame++) samples.push({ repetition, frame, ...await render(frame, true) });
    }
    // Refresh after the promise chain so the exported still has a live texture.
    await render(90, false);
    const png = canvas.toDataURL("image/png");
    const info = adapter.info;
    const intervals = samples.flatMap(sample => sample.intervalMs === undefined ? [] : [sample.intervalMs]);
    return {
      environment: { browser: navigator.userAgent, adapter: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description },
        timestampQuery: timestamps, timestampQuerySupported: timestampSupported, paced, width, height, warmup, frames, repetitions, devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight }, visibility: document.visibilityState },
      methodology: `${paced ? "rAF-paced" : "Unpaced"} fixed-clock samples; completedMs includes uniform evaluation, writes, encode, submit and queue completion. GPU frame span is the last pass end minus the first pass beginning; pass scopes may overlap and are non-additive. GPU timestamps exclude CPU and presentation and are disabled in paced runs to avoid readback overhead. rAF cadence is browser callback cadence, not evidence of physical display presentation.`,
      pipeline: { targets: definition.targets, passes: definition.passes.map(pass => ({ id: pass.id, kind: pass.kind })) },
      completed: summarize(samples.map(sample => sample.completedMs)),
      gpu: timestamps ? summarize(samples.map(sample => sample.gpuMs!)) : null,
      passes: timestamps ? Object.fromEntries(definition.passes.map(pass => [pass.id, summarize(samples.map(sample => sample.passes![pass.id]))])) : null,
      cadence: intervals.length ? { ...summarize(intervals), intervalCount: intervals.length,
        observedFps: intervals.length * 1000 / intervals.reduce((sum, ms) => sum + ms, 0),
        longIntervalsOver25Ms: intervals.filter(ms => ms > 25).length,
        estimatedMissed60HzFrames: intervals.reduce((sum, ms) => sum + Math.max(0, Math.round(ms / (1000 / 60)) - 1), 0) } : null,
      repetitions: Array.from({ length: repetitions }, (_, repetition) => ({ repetition,
        completed: summarize(samples.filter(sample => sample.repetition === repetition).map(sample => sample.completedMs)),
        gpu: timestamps ? summarize(samples.filter(sample => sample.repetition === repetition).map(sample => sample.gpuMs!)) : null })),
      samples, png,
    };
  } finally {
    context.unconfigure();
    device.destroy();
  }
}
