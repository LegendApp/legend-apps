import { createSnapshotImageCache } from "@legend-apps/presentation";
import { Skia, type SkCanvas, type SkImage, type SkPaint } from "@shopify/react-native-skia";
import { runOnUI } from "react-native-reanimated";

export function disposeBlurImage(image: SkImage) {
  runOnUI(() => { "worklet"; image.dispose(); })();
}
export const blurImages = createSnapshotImageCache<SkImage>({ dispose: disposeBlurImage, maxBytes: 16 * 1024 * 1024, maxEntries: 24 });

function renderBlurImage(width: number, height: number, draw: (canvas: SkCanvas, paint: SkPaint) => void): SkImage | null {
  const scale = Math.min(1, 512 / Math.max(width, height));
  let surface: ReturnType<typeof Skia.Surface.MakeOffscreen> | undefined;
  let paint: SkPaint | undefined;
  try {
    surface = Skia.Surface.MakeOffscreen(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    if (!surface) return null;
    paint = Skia.Paint();
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color("transparent"));
    canvas.scale(surface.width() / width, surface.height() / height);
    draw(canvas, paint);
    surface.flush();
    return surface.makeImageSnapshot();
  } catch {
    return null;
  } finally { paint?.dispose(); surface?.dispose(); }
}

/** Blur hides detail; retain at most 512 pixels along the longest edge. */
export function resizeBlurImage(image: SkImage): SkImage {
  const width = image.width(), height = image.height();
  if (Math.max(width, height) <= 512) return image;
  const result = renderBlurImage(width, height, (canvas, paint) => {
    const bounds = Skia.XYWHRect(0, 0, width, height);
    canvas.drawImageRect(image, bounds, bounds, paint);
  });
  if (!result) return image;
  disposeBlurImage(image);
  return result;
}
