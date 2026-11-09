// @ts-nocheck Actual resampling and poster composition with controlled native surfaces.
import { expect, mock, test } from "bun:test";
const { createSnapshotImageCache } = await import("../../presentation/src/snapshotImageCache");
mock.module("@legend-apps/presentation", () => ({ createSnapshotImageCache }));
const surfaces = [], scales = [];
let available = true, fail = false;
const small = { width: () => 512, height: () => 320, dispose() {} };
mock.module("@shopify/react-native-skia", () => ({ Skia: {
  Color: value => value,
  XYWHRect: (x,y,width,height) => ({x,y,width,height}), Paint: () => ({ dispose() {}, setColor() {} }),
  Surface: { MakeOffscreen(width,height) {
    if (!available) return null;
    const surface = { width: () => width, height: () => height, disposed: 0,
      getCanvas: () => ({ clear() {}, scale: (...args) => scales.push(args), drawImageRect() {} }), flush() {},
      makeImageSnapshot() { if (fail) throw Error("capture failed"); return small; }, dispose() { this.disposed++; } };
    surfaces.push(surface); return surface;
  } },
} }));
const { resizeBlurImage } = await import("../packs/media/blurImages");
test("large textures downsample with the same aspect ratio and release the full-size image", () => {
  let disposed = 0;
  const image = { width: () => 3120, height: () => 1950, dispose: () => disposed++ };
  expect(resizeBlurImage(image)).toBe(small);
  expect(surfaces.at(-1).width()).toBe(512); expect(surfaces.at(-1).height()).toBe(320);
  expect(scales.at(-1)).toEqual([512/3120,320/1950]);
  expect(disposed).toBe(1); expect(surfaces.at(-1).disposed).toBe(1);
  expect(resizeBlurImage(small)).toBe(small); expect(surfaces).toHaveLength(1);
});
test("unavailable or failed surfaces preserve the owned original as a live fallback", () => {
  let disposed = 0;
  const image = { width: () => 1024, height: () => 64, dispose: () => disposed++ };
  available = false; expect(resizeBlurImage(image)).toBe(image);
  available = true; fail = true; expect(resizeBlurImage(image)).toBe(image);
  expect(disposed).toBe(0); expect(surfaces.at(-1).disposed).toBe(1);
  fail = false;
});
