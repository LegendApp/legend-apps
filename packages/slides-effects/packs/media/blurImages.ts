import { createSnapshotImageCache } from "@legend-apps/presentation";
import { Skia, ClipOp, matchFont, type SkCanvas, type SkImage, type SkPaint } from "@shopify/react-native-skia";
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

/** Native view capture cannot read Metal video layers; draw their static poster directly. */
export async function loadPosterBlurImage(uri: string, width: number, height: number, top: number, caption?: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  let poster: SkImage | null;
  try { poster = Skia.Image.MakeImageFromEncoded(data); } finally { data.dispose(); }
  if (!poster) throw new Error("Could not decode carousel poster.");
  try {
    const result = renderBlurImage(width, height, (canvas, paint) => {
      if (caption) {
        const font = matchFont({ fontSize: width * 0.035, fontWeight: "600" });
        try {
          const metrics = font.getMetrics();
          paint.setColor(Skia.Color("#f8fafc"));
          canvas.drawText(caption, (width - font.measureText(caption).width) / 2,
            (top - metrics.ascent - metrics.descent) / 2, paint, font);
        } finally { font.dispose(); }
      }
      const body = Skia.XYWHRect(0, top, width, height - top);
      canvas.clipRRect(Skia.RRectXY(body, 12, 12), ClipOp.Intersect, true);
      paint.setColor(Skia.Color("#14253a"));
      canvas.drawRect(body, paint);
      const scale = Math.min(width / poster.width(), body.height / poster.height());
      const drawnWidth = poster.width() * scale, drawnHeight = poster.height() * scale;
      canvas.drawImageRect(poster, Skia.XYWHRect(0, 0, poster.width(), poster.height()),
        Skia.XYWHRect((width - drawnWidth) / 2, top + (body.height - drawnHeight) / 2, drawnWidth, drawnHeight), paint);
    });
    if (!result) throw new Error("Could not draw carousel poster.");
    return result;
  } finally { disposeBlurImage(poster); }
}
