import { Canvas, Group } from "@shopify/react-native-skia";
import { createContext, useContext, type ReactNode } from "react";

export const PresentationCanvasScaleContext = createContext(1);

/** Rasterize at display size while keeping shaders in logical slide coordinates. */
export function PresentationCanvas({ children, width, height }: { children: ReactNode; width: number; height: number }) {
  const scale = useContext(PresentationCanvasScaleContext);
  if (!(scale > 0)) return null;
  return <Canvas pointerEvents="none" style={{ position: "absolute", left: 0, top: 0,
    width: width * scale, height: height * scale, transformOrigin: "top left", transform: [{ scale: 1 / scale }] }}>
    <Group transform={[{ scale }]}>{children}</Group>
  </Canvas>;
}
