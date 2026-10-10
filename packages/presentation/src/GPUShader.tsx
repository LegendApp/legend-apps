import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { SharedValue } from "react-native-reanimated";

export type GPUShaderProps = {
  code: string; width?: number; height?: number; background?: boolean;
  particles?: boolean; particleCount?: number; particleVertexCount?: number;
  particleBlend?: "additive" | "over"; previewTime?: number;
  clock?: "slide" | "step"; image?: string; composite?: boolean;
  frameData?: SharedValue<number[]>; frameDataSize?: number;
  active?: boolean; children?: ReactNode;
  maxTime?: number; frameTimeIndex?: number;
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
