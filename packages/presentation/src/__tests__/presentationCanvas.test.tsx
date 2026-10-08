// @ts-nocheck Native canvas leaves are mocked; context changes and transforms are real.
import "../../../../apps/slides/src/__tests__/nativeMock";
import { expect, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { PixelRatio } from "react-native";
import { PresentationCanvas, PresentationCanvasScaleContext } from "../PresentationCanvas";

test("a density-capped effect retains its displayed geometry across preview and fullscreen resizes", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = spyOn(console, "error").mockImplementation(() => {});
  const density = spyOn(PixelRatio, "get").mockReturnValue(2);
  const render = (scale, cap) => <PresentationCanvasScaleContext.Provider value={scale}>
    <PresentationCanvas width={384} height={980} maxPixelDensity={cap}><effect /></PresentationCanvas>
  </PresentationCanvasScaleContext.Provider>;
  let tree;
  try {
    await act(() => { tree = create(render(0.25, 1)); });
    expect(tree.root.findByType("canvas").props.style.width).toBe(96);
    await act(() => tree.update(render(0.9, 1)));
    expect(tree.root.findByType("canvas").props.style.width).toBe(192);
    expect(tree.root.findByType("canvas").props.style.height).toBe(490);
    const canvas = tree.root.findByType("canvas").props;
    const group = tree.root.findByType("group").props;
    expect(group.transform[0].scale * canvas.style.transform[0].scale).toBe(1);
    await act(() => tree.update(render(0.9, undefined)));
    expect(tree.root.findByType("canvas").props.style.width).toBeCloseTo(345.6);
    density.mockReturnValue(1);
    await act(() => tree.update(render(0.9, 1)));
    expect(tree.root.findByType("canvas").props.style.width).toBeCloseTo(345.6);
    await act(() => tree.update(render(0, 1)));
    expect(tree.toJSON()).toBeNull();
  } finally {
    if (tree) await act(() => tree.unmount());
    density.mockRestore();
    errors.mockRestore();
  }
});
