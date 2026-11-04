// @ts-nocheck Inspect baked data and per-surface sampling without a native GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { sampleWorldUniforms, worldHeaderSize } from "../packs/world/scene";

const mutables = [];
const animated = { ...await import("react-native-reanimated") };
mock.module("react-native-reanimated", () => ({ ...animated,
  makeMutable: value => { mutables.push(value); return { value }; },
}));
mock.module("@legend-apps/presentation", () => ({
  Background: ({ children }) => children,
  GPURenderGraph: () => null,
  PresentationCanvasScaleContext: React.createContext(1),
  PresentationObservableProvider: ({ children }) => children,
  registerAdvanceGuard: () => () => {},
  useBackgroundSize: () => ({ width: 1280, height: 720 }),
  usePlayback: () => ({ value: { phase: "preview" } }),
  usePresentation$: () => null,
  usePresentationValue: key => key === "playbackPhase" ? "preview" : undefined,
  useRuntimeProjection: () => null,
}));
const { World, Sphere } = await import("../packs/world/World");

test("surfaces share the bake, retain independent uniform caches and invalidate changed inputs", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const children = <Sphere id="shared" position={{ 0: [0, 0, 0], 1: [4, 0, 0] }} />;
  const surfaces = [];
  const mount = async (props = {}, content = children) => {
    const start = mutables.length;
    await act(() => { surfaces.push(create(<World {...props}>{content}</World>)); });
    return mutables.slice(start).find(value => value?.instances);
  };
  try {
    const first = await mount(), second = await mount();
    expect(first).not.toBe(second);
    expect(first.instances).toBe(second.instances);
    const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
    const a = sampleWorldUniforms(first, clock, null, 1, 1, true);
    const b = sampleWorldUniforms(second, { ...clock, stepIndex: 1, stepTime: 1, slideTime: 1 }, null, 1, 1, true);
    expect(a).not.toBe(b);
    expect(a[worldHeaderSize]).toBe(0);
    expect(b[worldHeaderSize]).toBe(4);
    const changed = await mount({ exposure: 2 });
    expect(changed.instances).not.toBe(first.instances);
    expect(sampleWorldUniforms(changed, clock)[8]).toBe(2);
    expect(sampleWorldUniforms(first, clock)[8]).toBe(1);
    const edited = await mount({}, <Sphere id="edited" size={2} />);
    expect(edited.instances).not.toBe(first.instances);
    expect(sampleWorldUniforms(edited, clock)[worldHeaderSize + 3]).toBe(2);
  } finally { for (const surface of surfaces) await act(() => surface.unmount()); }
});
