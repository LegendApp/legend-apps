import { createContext, useContext, useMemo, type ComponentType, type ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";

export type GPUShaderProps = {
  code: string; width?: number; height?: number; background?: boolean;
  particles?: boolean; particleCount?: number; particleVertexCount?: number;
  particleBlend?: "additive" | "over"; previewTime?: number;
  clock?: "slide" | "step"; image?: string; composite?: boolean;
  frameData?: Readonly<Pick<SharedValue<number[] | Float32Array<ArrayBuffer>>, "value">>; frameDataSize?: number;
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
  /** 4 renders through a multisampled attachment; colour resolves into this target, depth is read as texture_depth_multisampled_2d. */
  samples?: 1 | 4;
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
      /** Skip instances whose float in the uniform snapshot is <= threshold; retain their original instance indices. */
      instanceCull?: { offset: number; stride: number; threshold: number };
      blend?: "none" | "additive" | "over"; reads?: string[];
      clear?: [number, number, number, number] | false;
      depthCompare?: "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always" }
  | { kind: "fullscreen"; id: string; code: string; fragment: string;
      output: string; reads?: string[]; mip?: number };
/** A static image texture the host loads once from a data, file or web URI; passes read it by id like a target (rgba8unorm, premultiplied alpha). */
export type GPUImage = { id: string; source: string };
export type GPURenderGraphDefinition = { targets: GPUTarget[]; buffers?: GPUBufferTarget[]; images?: GPUImage[]; passes: GPUPass[] };
export type GPURenderGraphProps = Omit<GPUShaderProps,
  "code" | "particles" | "particleCount" | "particleVertexCount" | "particleBlend" | "composite" | "image" | "frameData" | "frameDataSize" | "renderGraph"> &
  GPURenderGraphDefinition & { uniforms?: GPUShaderProps["frameData"]; /** Float capacity, defaults to 4096. */ uniformsSize?: number };
/** Group 0: Frame at 0, read-only float uniforms at 1, linear sampler at 2,
 * then reads and compute writes. Fullscreen vertex output has position and location-0 UV. */
export function GPURenderGraph({ targets, buffers, images, passes, uniforms, uniformsSize = 4096, ...props }: GPURenderGraphProps) {
  const renderGraph = useMemo(() => ({ targets, buffers, images, passes }), [targets, buffers, images, passes]);
  return <GPUShader {...props} code="" renderGraph={renderGraph} frameData={uniforms} frameDataSize={uniformsSize} />;
}
