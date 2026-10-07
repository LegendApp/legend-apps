// @ts-nocheck Native Skia elements are mocked by nativeMock.
import { expect, test } from "bun:test";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { PresentationCanvas, PresentationCanvasScaleContext } from "@legend-apps/presentation";

test("presentation canvas matches display pixels without moving shader coordinates when resized", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer: ReactTestRenderer | undefined;
  const surface = (scale: number) => <PresentationCanvasScaleContext.Provider value={scale}>
    <PresentationCanvas width={1920} height={1080}><shader /></PresentationCanvas>
  </PresentationCanvasScaleContext.Provider>;
  try {
    await act(() => { renderer = create(surface(0)); });
    expect(renderer!.toJSON()).toBeNull();
    for (const scale of [300 / 1080, 688 / 1080, 1, 1.5]) {
      await act(() => renderer!.update(surface(scale)));
      const canvas = renderer!.root.findByType("canvas");
      const group = renderer!.root.findByType("group");
      expect(canvas.props.style.width).toBeCloseTo(1920 * scale);
      expect(canvas.props.style.height).toBeCloseTo(1080 * scale);
      // Skia scales logical coordinates into the raster; the native inverse
      // scale puts them back into the stage before ScaledView displays it.
      const rasterScale = group.props.transform[0].scale;
      const nativeScale = canvas.props.style.transform[0].scale;
      expect(canvas.props.style.transformOrigin).toBe("top left");
      for (const [x, y] of [[0, 0], [960, 540], [1920, 1080]]) {
        expect(x * rasterScale * nativeScale * scale).toBeCloseTo(x * scale);
        expect(y * rasterScale * nativeScale * scale).toBeCloseTo(y * scale);
      }
      expect(group.findByType("shader")).toBeDefined();
    }
  } finally {
    if (renderer) await act(() => renderer.unmount());
  }
});
