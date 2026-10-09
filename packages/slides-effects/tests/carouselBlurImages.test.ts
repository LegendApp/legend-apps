// @ts-nocheck Actual resampling and poster composition with controlled native surfaces.
import { expect, mock, test } from "bun:test";
const { createSnapshotImageCache } = await import("../../presentation/src/snapshotImageCache");
mock.module("@legend-apps/presentation", () => ({ createSnapshotImageCache }));
const surfaces = [], draws = [], scales = [], clips = [], labels = [], fonts = [];
let available = true, fail = false, dataDisposals = 0, posterDisposals = 0;
const small = { width: () => 512, height: () => 320, dispose() {} };
const poster = { width: () => 1600, height: () => 1000, dispose: () => posterDisposals++ };
mock.module("@shopify/react-native-skia", () => ({ ClipOp: { Intersect: 1 }, matchFont: options => {
  fonts.push(options); return { getMetrics: () => ({ascent:-40,descent:10}), measureText: () => ({width:300}), dispose() {} };
}, Skia: {
  Color: value => value, RRectXY: (rect,rx,ry) => ({ rect,rx,ry }),
  Data: { fromURI: async () => ({ dispose: () => dataDisposals++ }) }, Image: { MakeImageFromEncoded: () => poster },
  XYWHRect: (x,y,width,height) => ({x,y,width,height}), Paint: () => ({ dispose() {}, setColor() {} }),
  Surface: { MakeOffscreen(width,height) {
    if (!available) return null;
    const surface = { width: () => width, height: () => height, disposed: 0,
      getCanvas: () => ({ clear() {}, drawText: (...args) => labels.push(args), scale: (...args) => scales.push(args), clipRRect: (...args) => clips.push(args), drawRect() {}, drawImageRect: (...args) => draws.push(args) }), flush() {},
      makeImageSnapshot() { if (fail) throw Error("capture failed"); return small; }, dispose() { this.disposed++; } };
    surfaces.push(surface); return surface;
  } },
} }));
const { resizeBlurImage, loadPosterBlurImage } = await import("../packs/media/blurImages");
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
test("recording posters preserve caption spacing, contain sizing and rounded media bounds without a view readback", async () => {
  expect(await loadPosterBlurImage("poster",1560,975,97.5)).toBe(small);
  expect(clips.at(-1)[0]).toEqual({rect:{x:0,y:97.5,width:1560,height:877.5},rx:12,ry:12});
  expect(draws.at(-1)[2]).toEqual({x:78,y:97.5,width:1404,height:877.5});
  expect(dataDisposals).toBe(1); expect(posterDisposals).toBe(1);
  available = false;
  await expect(loadPosterBlurImage("poster",1560,975,97.5)).rejects.toThrow("Could not draw");
  expect(dataDisposals).toBe(2); expect(posterDisposals).toBe(2);
  available = true;
});


test("recorded app captions keep the same font size, weight, centering and caption inset", async () => {
  await loadPosterBlurImage("poster",1600,1000,100,"Legend Photos");
  expect(fonts.at(-1)).toEqual({fontSize:56.00000000000001,fontWeight:"600"});
  expect(labels.at(-1).slice(0,3)).toEqual(["Legend Photos",650,65]);
});
