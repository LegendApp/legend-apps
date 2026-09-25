import type { TypeGPUScene } from "@legend-apps/presentation";
import type { StyleProp, ViewStyle } from "react-native";

/** Migration guard for decks using the retired JavaScript frame callback API. */
export function TypeGPU(_props: {
  scene: TypeGPUScene; width?: number; height?: number; previewTime?: number;
  backgroundColor?: string; transparent?: boolean; style?: StyleProp<ViewStyle>;
}): never {
  throw new Error("TypeGPU scene callbacks are no longer supported. Use TypeGPUShader with a WGSL program; its animation runs on the shared UI-thread playback clock.");
}
