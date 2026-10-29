import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";

export type GPUShaderProps = {
  code: string; width?: number; height?: number; background?: boolean;
  particles?: boolean; particleCount?: number; particleVertexCount?: number;
  particleBlend?: "additive" | "over"; previewTime?: number;
  clock?: "slide" | "step"; image?: string; composite?: boolean;
  frameData?: SharedValue<number[]>; frameDataSize?: number;
  active?: boolean; children?: ReactNode;
  maxTime?: number; frameTimeIndex?: number;
  renderGraph?: GPURenderGraphDefinition;
  /** Positive shared multiplier for graph offscreen textures, including values above 1.
   * Changes recreate/clear those textures; screen resolution stays fixed. Ignored without renderGraph. */
  renderScale?: SharedValue<number>;
  borderRadius?: number; accessibilityLabel?: string;
};
const GPUShaderContext = createContext<ComponentType<GPUShaderProps> | null>(null);
export function GPUShaderProvider({ renderer, children }: { renderer: ComponentType<GPUShaderProps>; children?: ReactNode }) {
  return <GPUShaderContext.Provider value={renderer}>{children}</GPUShaderContext.Provider>;
}
/** Packs describe a program; the host owns its canvas, playback and GPU lifetime. */
export function GPUShader(props: GPUShaderProps) {
  const Renderer = useContext(GPUShaderContext);
  if (!Renderer) throw new Error("GPUShader requires a GPUShaderProvider");
  return <Renderer {...props} />;
}

export type GPUTarget = {
  id: string; format: "rgba16float" | "rgba8unorm" | "depth32float" | "r32float";
  scale?: number; mips?: number;
};
export type GPUBufferTarget = { id: string; size: number; init?: Float32Array };
/** Resource references accept `id@N` to select mip N; bindings follow reads, then writes. */
export type GPUPass =
  | { kind: "compute"; id: string; code: string; entry: string;
      /** perPixel assumes an 8x8 workgroup; perInstance assumes 64 threads. */
      workgroups: [number, number?, number?] | "perPixel" | { perInstance: number };
      reads?: string[]; writes?: string[] }
  | { kind: "render"; id: string; code: string; vertex: string; fragment: string;
      color: string[]; depth?: string; vertexCount: number; instanceCount?: number;
      blend?: "none" | "additive" | "over"; reads?: string[];
      clear?: [number, number, number, number] | false;
      depthCompare?: "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always" }
  | { kind: "fullscreen"; id: string; code: string; fragment: string;
      output: string; reads?: string[]; mip?: number };
export type GPURenderGraphDefinition = { targets: GPUTarget[]; buffers?: GPUBufferTarget[]; passes: GPUPass[] };
export type GPURenderGraphProps = Omit<GPUShaderProps,
  "code" | "particles" | "particleCount" | "particleVertexCount" | "particleBlend" | "composite" | "image" | "frameData" | "frameDataSize" | "renderGraph"> &
  GPURenderGraphDefinition & { uniforms?: SharedValue<number[]>; /** Float capacity, defaults to 4096. */ uniformsSize?: number };
/** Group 0: Frame at 0, read-only float uniforms at 1, linear sampler at 2,
 * then reads and compute writes. Fullscreen vertex output has position and location-0 UV. */
export function GPURenderGraph({ targets, buffers, passes, uniforms, uniformsSize = 4096, ...props }: GPURenderGraphProps) {
  const renderGraph = useMemo(() => ({ targets, buffers, passes }), [targets, buffers, passes]);
  return <GPUShader {...props} code="" renderGraph={renderGraph} frameData={uniforms} frameDataSize={uniformsSize} />;
}
