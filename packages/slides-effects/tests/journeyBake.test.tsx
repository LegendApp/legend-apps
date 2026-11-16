// @ts-nocheck Inspect baked data and per-surface sampling without a native GPU.
import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { sampleJourneyUniforms, journeyHeaderSize } from "../packs/journey/scene";

const mutables = [];
const animated = { ...await import("react-native-reanimated") };
mock.module("react-native-reanimated", () => ({ ...animated,
  makeMutable: value => { mutables.push(value); return { value }; },
}));
mock.module("@legend-apps/presentation", () => ({
  Background: ({ children }) => children, RetainedSurface: ({ children }) => children, useSurfaceSuspension: () => null, useBackgroundReady: () => true,
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
const { Journey, Sphere } = await import("../packs/journey/Journey");

test("surfaces share one sampled scene, keep separate uniform buffers and invalidate changed inputs", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const sphere = () => <Sphere id="shared" position={{ 0: [0, 0, 0], 1: [4, 0, 0] }} />;
  const surfaces = [];
  const mount = async (props = {}, content = sphere()) => {
    const start = mutables.length;
    await act(() => { surfaces.push(create(<Journey {...props}>{content}</Journey>)); });
    return mutables.slice(start).find(value => value?.instances);
  };
  try {
    const first = await mount();
    // A re-created but equal declaration reuses the prepared scene and its UI copy.
    expect(await mount()).toBeUndefined();
    const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
    const a = sampleJourneyUniforms(first, clock, null, 1, 1, {});
    const b = sampleJourneyUniforms(first, { ...clock, stepIndex: 1, stepTime: 1, slideTime: 1 }, null, 1, 1, {});
    expect(a).not.toBe(b);
    expect(a[journeyHeaderSize]).toBe(0);
    expect(b[journeyHeaderSize]).toBe(4);
    const changed = await mount({ exposure: 2 });
    expect(changed.instances).not.toBe(first.instances);
    expect(sampleJourneyUniforms(changed, clock)[8]).toBe(2);
    expect(sampleJourneyUniforms(first, clock)[8]).toBe(1);
    const edited = await mount({}, <Sphere id="shared" position={{ 0: [0, 0, 0], 1: [4, 0, 0] }} size={2} />);
    expect(edited.instances).not.toBe(first.instances);
    expect(sampleJourneyUniforms(edited, clock)[journeyHeaderSize + 3]).toBe(2);
  } finally { for (const surface of surfaces) await act(() => surface.unmount()); }
});

test("preparing a background bakes its scene before the surface mounts", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const declaration = () => <Sphere id="warm" position={[1, 2, 3]} />;
  const start = mutables.length;
  Journey.prepareBackground({ background: true, children: declaration() });
  expect(mutables.slice(start).filter(value => value?.instances)).toHaveLength(1);
  let surface;
  await act(() => { surface = create(<Journey background>{declaration()}</Journey>); });
  expect(mutables.slice(start).filter(value => value?.instances)).toHaveLength(1);
  await act(() => surface.unmount());
});
