import { toBlob } from "html-to-image";
import { forwardRef } from "react";
import { View } from "react-native";
import { Skia, Canvas as SkiaCanvas, Path as SkiaPath, Text as SkiaText, type CanvasRef, type CanvasProps, type SkFont, type SkPath } from "@shopify/react-native-skia/lib/module";
import { preloadedSource } from "./preload";
export * from "@shopify/react-native-skia/lib/module";
const dataFromURI = Skia.Data.fromURI.bind(Skia.Data);
Skia.Data.fromURI = uri => dataFromURI(preloadedSource(uri));

export const Canvas = forwardRef<CanvasRef, CanvasProps>(function Canvas({ style, ...props }, ref) {
  return <View style={style}><SkiaCanvas {...props} ref={ref} style={{ width: "100%", height: "100%" }} /></View>;
});
let typeface: ReturnType<typeof Skia.Typeface.MakeFreeTypeFaceFromData>;
export async function initializeFonts(uri: string) {
  const data = await Skia.Data.fromURI(uri);
  try { typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data); } finally { data.dispose(); }
  if (!typeface) throw new Error("Could not load presentation font");
}
export function matchFont({ fontSize = 16 }: { fontSize?: number; [key: string]: unknown } = {}) {
  return Skia.Font(typeface!, fontSize);
}
type TextPath = { webText: { text: string; x: number; y: number; font: SkFont } };
Skia.Path.MakeFromText = (text, x, y, font) => ({ webText: { text, x, y, font: matchFont({ fontSize: font.getSize() }) } }) as unknown as SkPath;
export function Path({ path, ...props }: any) {
  const text = (path as TextPath)?.webText;
  return text ? <SkiaText {...props} {...text} /> : <SkiaPath {...props} path={path} />;
}
// CanvasKit cannot apply native runtime shader image filters; retain the input.
export function RuntimeShader({ children }: { children?: React.ReactNode }) { return children; }
export async function makeImageFromView(ref: { current: HTMLElement | null }) {
  const element = ref.current;
  if (!element) throw new Error("Cannot capture an unmounted view");
  await document.fonts.ready;
  const blob = await toBlob(element, { pixelRatio: 1, width: element.offsetWidth, height: element.offsetHeight, style: { opacity: "1" } });
  if (!blob) throw new Error("Could not capture slide content");
  const data = Skia.Data.fromBytes(new Uint8Array(await blob.arrayBuffer()));
  try { return Skia.Image.MakeImageFromEncoded(data); } finally { data.dispose(); }
}
