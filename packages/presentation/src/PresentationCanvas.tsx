import { Canvas, Group } from "@shopify/react-native-skia";
import { createContext, useContext, type ReactNode } from "react";
import { PixelRatio } from "react-native";

export const PresentationCanvasScaleContext = createContext(1);

/** Rasterize at display size while keeping shaders in logical slide coordinates.
 * maxPixelDensity caps physical pixels per logical slide unit for soft effects.
 */
export function PresentationCanvas({ children, width, height, maxPixelDensity }: { children: ReactNode; width: number; height: number; maxPixelDensity?: number }) {
  const displayScale = useContext(PresentationCanvasScaleContext);
  const scale = maxPixelDensity !== undefined && maxPixelDensity > 0
    ? Math.min(displayScale, maxPixelDensity / PixelRatio.get()) : displayScale;
  if (!(scale > 0)) return null;
  return <Canvas pointerEvents="none" style={{ position: "absolute", left: 0, top: 0,
    width: width * scale, height: height * scale, transformOrigin: "top left", transform: [{ scale: 1 / scale }] }}>
    <Group transform={[{ scale }]}>{children}</Group>
  </Canvas>;
}
