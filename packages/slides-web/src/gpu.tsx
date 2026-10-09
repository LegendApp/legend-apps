// Native TypeGPU worklet renderers have no browser backend. Decorative only.
export function TypeGPU() { return null; }
export function TypeGPUShader() { return null; }
export const Canvas = TypeGPU;
export const GPUBufferUsage = globalThis.GPUBufferUsage;
export const GPUShaderStage = globalThis.GPUShaderStage;
export const GPUTextureUsage = globalThis.GPUTextureUsage;
