import type { GPURenderGraphDefinition, GPUPass, GPUTarget } from "@legend-apps/presentation";

export const graphVertex = `
struct GraphVertex { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn graphVertex(@builtin(vertex_index) id: u32) -> GraphVertex {
  let p = vec2f(f32((id << 1u) & 2u), f32(id & 2u));
  return GraphVertex(vec4f(p * 2.0 - 1.0, 0.0, 1.0), vec2f(p.x, 1.0 - p.y));
}`;

type PassResources = { pass: GPUPass; pipeline: GPUComputePipeline | GPURenderPipeline; layout: GPUBindGroupLayout; group?: GPUBindGroup; resolves: boolean[] };
export type RenderGraphResources = {
  targets: GPUTarget[]; textures: Record<string, GPUTexture>; buffers: Record<string, GPUBuffer>;
  passes: PassResources[]; clock: GPUBuffer; uniforms: GPUBuffer; sampler: GPUSampler;
  width: number; height: number; scale: number;
};

function reference(value: string): [string, number] {
  "worklet";
  const parts = value.split("@");
  return [parts[0], parts.length === 1 ? 0 : parts.length === 2 && parts[1] !== "" ? Number(parts[1]) : NaN];
}
function targetFor(targets: GPUTarget[], value: string) {
  "worklet";
  const [id] = reference(value);
  const target = targets.find(target => target.id === id);
  if (!target) throw new Error("Unknown GPU target: " + value);
  return target;
}
function view(r: RenderGraphResources, value: string) {
  "worklet";
  const [id, mip] = reference(value);
  return r.textures[id].createView({ baseMipLevel: mip, mipLevelCount: 1 });
}
function multisampled(r: { targets: GPUTarget[] }, value: string) {
  "worklet";
  return value !== "screen" && (targetFor(r.targets, value).samples ?? 1) > 1;
}
function output(pass: GPUPass) {
  "worklet";
  if (pass.kind === "fullscreen") return pass.mip === undefined ? pass.output : pass.output + "@" + pass.mip;
  return pass.kind === "render" ? pass.color[0] ?? pass.depth ?? "screen" : pass.writes?.[0] ?? "screen";
}
function dimensions(r: RenderGraphResources, value: string, width: number, height: number, renderScale = r.scale): [number, number] {
  "worklet";
  const [id, mip] = reference(value);
  if (value === "screen" || r.buffers[id]) return [width, height];
  const target = targetFor(r.targets, value);
  if (r.textures[id] && r.width === width && r.height === height && r.scale === renderScale) return [Math.max(1, r.textures[id].width >> mip), Math.max(1, r.textures[id].height >> mip)];
  const scale = (target.scale ?? 1) * renderScale / Math.pow(2, mip);
  return [Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale))];
}

/** Setup is shared by native/web hosts and standalone browser measurements. */
export async function prepareRenderGraph(device: GPUDevice, definition: GPURenderGraphDefinition, format: GPUTextureFormat,
  clock: GPUBuffer, uniforms: GPUBuffer): Promise<RenderGraphResources> {
  const { targets, buffers = [], passes } = definition;
  const ids = new Set<string>();
  for (const resource of [...targets, ...buffers]) {
    if (!resource.id || resource.id === "screen" || resource.id.includes("@") || resource.id in Object.prototype || ids.has(resource.id)) throw new Error("Invalid or duplicate GPU resource: " + resource.id);
    ids.add(resource.id);
  }
  for (const target of targets) {
    if (!Number.isFinite(target.scale ?? 1) || (target.scale ?? 1) <= 0 || !Number.isInteger(target.mips ?? 1) || (target.mips ?? 1) < 1) throw new Error("Invalid GPU target dimensions: " + target.id);
    if (![1, 4].includes(target.samples ?? 1) || ((target.samples ?? 1) > 1 && ((target.mips ?? 1) > 1 || target.format === "r32float"))) throw new Error("Invalid GPU target samples: " + target.id);
  }
  const r: RenderGraphResources = { targets, textures: {}, buffers: {}, passes: [], clock, uniforms,
    sampler: device.createSampler({ minFilter: "linear", magFilter: "linear", mipmapFilter: "linear" }), width: 0, height: 0, scale: 1 };
  for (const buffer of buffers) {
    if (!Number.isInteger(buffer.size) || buffer.size <= 0 || buffer.size % 4 || (buffer.init && buffer.init.byteLength > buffer.size)) throw new Error("Invalid GPU buffer size: " + buffer.id);
    r.buffers[buffer.id] = device.createBuffer({ size: buffer.size, usage: 128 | 8 });
    if (buffer.init) device.queue.writeBuffer(r.buffers[buffer.id], 0, buffer.init.buffer, buffer.init.byteOffset, buffer.init.byteLength);
  }
  const checkReference = (value: string) => {
    const [id, mip] = reference(value);
    if (id === "screen") { if (value !== "screen") throw new Error("Screen has no mip levels"); return; }
    if (!ids.has(id)) throw new Error("Unknown GPU resource: " + value);
    if (!Number.isInteger(mip) || mip < 0 || (r.buffers[id] ? mip !== 0 : mip >= (targetFor(targets, value).mips ?? 1))) throw new Error("Invalid GPU mip: " + value);
  };
  for (const pass of passes) {
    for (const value of [...(pass.reads ?? []), ...(pass.kind === "compute" ? pass.writes ?? [] : pass.kind === "render" ? [...pass.color, ...(pass.depth ? [pass.depth] : [])] : [output(pass)])]) checkReference(value);
    const reads = new Set((pass.reads ?? []).map(value => { const [id, mip] = reference(value); return id + "@" + mip; }));
    const writes = pass.kind === "compute" ? pass.writes ?? [] : pass.kind === "render" ? [...pass.color, ...(pass.depth ? [pass.depth] : [])] : [output(pass)];
    if (writes.some(value => { const [id, mip] = reference(value); return reads.has(id + "@" + mip); })) throw new Error("GPU pass cannot read and write the same resource: " + pass.id);
    const entries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: 7, buffer: { type: "uniform" } },
      { binding: 1, visibility: 7, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: 7, sampler: { type: "filtering" } },
    ];
    for (const [index, value] of [...(pass.reads ?? []), ...(pass.kind === "compute" ? pass.writes ?? [] : [])].entries()) {
      const writing = index >= (pass.reads?.length ?? 0), [id] = reference(value);
      if (value === "screen") throw new Error("Screen cannot be bound as a GPU resource");
      const target = r.buffers[id] ? undefined : targetFor(targets, value);
      if (writing && target?.format === "depth32float") throw new Error("Depth textures cannot be storage outputs");
      entries.push({ binding: index + 3, visibility: writing ? 4 : 7,
        ...(r.buffers[id] ? { buffer: { type: writing ? "storage" as const : "read-only-storage" as const } }
          : writing ? { storageTexture: { access: "write-only" as const, format: target!.format } }
          : { texture: { sampleType: target!.format === "depth32float" ? "depth" as const : target!.format === "r32float" ? "unfilterable-float" as const : "float" as const,
            multisampled: target!.format === "depth32float" && (target!.samples ?? 1) > 1 } }) });
    }
    const module = device.createShaderModule({ code: pass.code + (pass.kind === "fullscreen" ? graphVertex : "") });
    const diagnostics = await module.getCompilationInfo();
    const errors = diagnostics.messages.filter(message => message.type === "error");
    if (errors.length) throw new Error(pass.id + ": " + errors.map(message => message.message).join("\n"));
    const layout = device.createBindGroupLayout({ entries });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    let pipeline: GPUComputePipeline | GPURenderPipeline;
    if (pass.kind === "compute") {
      pipeline = device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint: pass.entry } });
    } else {
      const colors = pass.kind === "render" ? pass.color : [output(pass)];
      const blend = pass.kind === "render" ? pass.blend : "none";
      pipeline = device.createRenderPipeline({ layout: pipelineLayout,
        vertex: { module, entryPoint: pass.kind === "render" ? pass.vertex : "graphVertex" },
        fragment: { module, entryPoint: pass.fragment, targets: colors.map(color => ({ format: color === "screen" ? format : targetFor(targets, color).format,
          ...(blend && blend !== "none" ? { blend: { color: { srcFactor: "one" as const, dstFactor: blend === "over" ? "one-minus-src-alpha" as const : "one" as const, operation: "add" as const },
            alpha: { srcFactor: "one" as const, dstFactor: "one-minus-src-alpha" as const, operation: "add" as const } } } : {}) })) },
        ...(pass.kind === "render" && pass.depth ? { depthStencil: { format: targetFor(targets, pass.depth).format, depthWriteEnabled: true, depthCompare: pass.depthCompare ?? "less" } } : {}),
        ...(pass.kind === "render" ? { multisample: { count: targetFor(targets, pass.color[0] ?? pass.depth!).samples ?? 1 } } : {}),
      });
    }
    r.passes.push({ pass, pipeline, layout, resolves: [] });
  }
  // A multisampled colour target resolves once, in the last render pass that writes it.
  const resolved = new Set<string>();
  for (let i = r.passes.length - 1; i >= 0; i--) {
    const { pass } = r.passes[i];
    if (pass.kind !== "render") continue;
    r.passes[i].resolves = pass.color.map(color => multisampled(r, color) && !resolved.has(color));
    for (const color of pass.color) resolved.add(color);
  }
  return r;
}

/** Recreate only textures/views/bind groups when drawing-buffer size or render scale changes. */
export function resizeRenderGraph(r: RenderGraphResources, device: GPUDevice, width: number, height: number, renderScale = 1) {
  "worklet";
  if (!Number.isFinite(renderScale) || renderScale <= 0) throw new Error("GPU renderScale must be finite and positive");
  if (r.width === width && r.height === height && r.scale === renderScale) return;
  for (const target of r.targets) {
    const old = r.textures[target.id];
    const [w, h] = dimensions(r, target.id, width, height, renderScale);
    const mips = target.mips ?? 1, samples = target.samples ?? 1, depth = target.format === "depth32float";
    // Allocate enough base pixels for all declared mip levels, even in tiny previews.
    const minSize = Math.pow(2, mips - 1);
    r.textures[target.id] = device.createTexture({ size: [Math.max(minSize, w), Math.max(minSize, h)], format: target.format, mipLevelCount: mips,
      sampleCount: depth ? samples : 1, usage: 16 | 4 | (depth || samples > 1 ? 0 : 8) });
    old?.destroy();
    if (samples > 1 && !depth) {
      r.textures[target.id + "#ms"]?.destroy();
      r.textures[target.id + "#ms"] = device.createTexture({ size: [w, h], format: target.format, sampleCount: samples, usage: 16 });
    }
  }
  for (const resource of r.passes) {
    const pass = resource.pass;
    resource.group = device.createBindGroup({ layout: resource.layout, entries: [
      { binding: 0, resource: { buffer: r.clock } }, { binding: 1, resource: { buffer: r.uniforms } }, { binding: 2, resource: r.sampler },
      ...[...(pass.reads ?? []), ...(pass.kind === "compute" ? pass.writes ?? [] : [])].map((value, index) => {
        const [id] = reference(value);
        return { binding: index + 3, resource: r.buffers[id] ? { buffer: r.buffers[id] } : view(r, value) };
      }),
    ] });
  }
  r.width = width; r.height = height; r.scale = renderScale;
}

/** One encoder for every pass; the caller submits and presents the final screen. */
export function encodeRenderGraph(r: RenderGraphResources, device: GPUDevice, encoder: GPUCommandEncoder, screen: GPUTexture, renderScale = 1) {
  "worklet";
  resizeRenderGraph(r, device, screen.width, screen.height, renderScale);
  for (const resource of r.passes) {
    const pass = resource.pass;
    if (pass.kind === "compute") {
      const command = encoder.beginComputePass();
      command.setPipeline(resource.pipeline as GPUComputePipeline); command.setBindGroup(0, resource.group!);
      const [width, height] = dimensions(r, output(pass), r.width, r.height);
      const groups = pass.workgroups;
      if (groups === "perPixel") command.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      else if (Array.isArray(groups)) command.dispatchWorkgroups(groups[0], groups[1] ?? 1, groups[2] ?? 1);
      else if (groups.perInstance > 0) command.dispatchWorkgroups(Math.ceil(groups.perInstance / 64));
      command.end();
    } else {
      const colors = pass.kind === "render" ? pass.color : [output(pass)];
      const clear = pass.kind === "render" ? pass.clear : undefined;
      const command = encoder.beginRenderPass({ colorAttachments: colors.map((color, index) => color === "screen" || !multisampled(r, color)
        ? { view: color === "screen" ? screen.createView() : view(r, color), clearValue: clear || [0, 0, 0, 0], loadOp: clear === false ? "load" as const : "clear" as const, storeOp: "store" as const }
        : { view: r.textures[color + "#ms"].createView(), resolveTarget: resource.resolves[index] ? view(r, color) : undefined,
          clearValue: clear || [0, 0, 0, 0], loadOp: clear === false ? "load" as const : "clear" as const, storeOp: resource.resolves[index] ? "discard" as const : "store" as const }),
        ...(pass.kind === "render" && pass.depth ? { depthStencilAttachment: { view: view(r, pass.depth), depthClearValue: 1, depthLoadOp: clear === false ? "load" as const : "clear" as const, depthStoreOp: "store" as const } } : {}) });
      command.setPipeline(resource.pipeline as GPURenderPipeline); command.setBindGroup(0, resource.group!);
      // Dawn reports zero-count draws through a logging callback that calls the JS runtime from this UI thread, which can crash Hermes.
      // An empty pass still clears its attachments.
      const vertices = pass.kind === "render" ? pass.vertexCount : 3, instances = pass.kind === "render" ? pass.instanceCount ?? 1 : 1;
      if (vertices > 0 && instances > 0) command.draw(vertices, instances);
      command.end();
    }
  }
}
