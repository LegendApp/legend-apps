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
  Fill: "fill", Shader: "shader", Path: "path",
  Skia: { RuntimeEffect: { Make: () => ({}) } },
}));
const { ExpoDesktopLayers } = await import("../../decks/react-native-desktop/ExpoDesktopScene");

test("Expo connection restarts from its click timestamp without remounting either Canvas", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    await act(() => { tree = create(<ExpoDesktopLayers />); });
    expect(desktopUniforms.connected).toBe(0);
    expect(mounts).toBe(2);
    time = 19;
    runtime = { ...runtime, stepIndex: 1 };
    await act(() => tree.update(<ExpoDesktopLayers />));
    expect(desktopUniforms).toEqual({ desktop: 1, connected: 1, startTime: 19 });
    expect(mounts).toBe(2);
    time = 25;
    runtime = { ...runtime, stepIndex: 0 };
    await act(() => tree.update(<ExpoDesktopLayers />));
    expect(desktopUniforms.connected).toBe(0);
    time = 30;
    runtime = { ...runtime, stepIndex: 1 };
    await act(() => tree.update(<ExpoDesktopLayers />));
    expect(desktopUniforms.startTime).toBe(30);
    expect(mounts).toBe(2);
    runtime = { ...runtime, isActive: false, isPreview: true };
    await act(() => tree.update(<ExpoDesktopLayers />));
    expect(desktopUniforms.startTime).toBe(30);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});
