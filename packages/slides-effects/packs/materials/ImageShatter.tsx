import { GPUShader } from "@legend-apps/presentation";
import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { createImageShatterGPU } from "./ImageShatterGPU";
export type ImageShatterGeometry = { imageWidth: number; imageHeight: number; centerX: number; centerY: number; scale?: number; radius?: number };
export function ImageShatter(props: { source: string; revealAtStep: number; geometry: ImageShatterGeometry; width: number; height: number; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const { source, revealAtStep, geometry, width, height, style, accessibilityLabel } = props;
  const code = useMemo(() => createImageShatterGPU(geometry, width, height, revealAtStep), [geometry, width, height, revealAtStep]);
  return <View style={[{ width, height }, style]} pointerEvents="none">
    <GPUShader code={code} width={width} height={height} image={source} particles particleCount={40}
      particleBlend="over" borderRadius={0} accessibilityLabel={accessibilityLabel} />
  </View>;
}
