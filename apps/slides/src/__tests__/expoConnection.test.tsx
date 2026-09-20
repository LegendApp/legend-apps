// @ts-nocheck Mocks isolate the native-tree clock from Skia's separate renderer.
import { expect, mock, test } from "bun:test";
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";

let runtime = { stepIndex: 0, isActive: true, isPreview: false, isPreparing: false };
let time = 7;
let desktopUniforms;
let mounts = 0;
mock.module("@legend-apps/presentation", () => ({
  usePresentationValue: (key) => runtime[key],
  SceneMotionView: "motion",
  useAnimatedShaderUniforms: (values) => {
    if (values.desktop) desktopUniforms = values;
    return { value: { ...values, time } };
  },
}));
mock.module("@shopify/react-native-skia", () => ({
  // Intentionally do not render children in the native React tree. Hooks
  // placed beneath Canvas would never receive the presentation context.
  Canvas: () => { useEffect(() => { mounts++; }, []); return null; },
  Fill: "fill", Shader: "shader", Path: "path", ImageShader: "image-shader",
  matchFont: () => ({ measureText: () => ({ x: 0, y: -50, width: 440, height: 64 }), dispose() {} }),
  Skia: {
    RuntimeEffect: { Make: () => ({}) }, Color: (color) => color,
    Paint: () => ({ setAntiAlias() {}, setColor() {}, dispose() {} }),
    Surface: { Make: () => ({ getCanvas: () => ({ clear() {}, drawText() {} }), makeImageSnapshot: () => ({}), dispose() {} }) },
  },
}));
const { ExpoDesktopLayers } = await import("../../decks/react-native-desktop/ExpoDesktopScene");

test("Expo connection delegates timing to the shared controller without remounting either Canvas", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    await act(() => { tree = create(<ExpoDesktopLayers />); });
    expect(desktopUniforms).toEqual({ desktop: 1 });
    expect(mounts).toBe(2);
    for (const stepIndex of [1, 0, 1]) {
      runtime = { ...runtime, stepIndex };
      await act(() => tree.update(<ExpoDesktopLayers />));
      // No JS timestamp snapshots or independently reset connection uniforms.
      expect(desktopUniforms).toEqual({ desktop: 1 });
      expect(mounts).toBe(2);
    }
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});
