// @ts-nocheck Native playback leaves are mocked; runtime and context updates are real.
import "../../../../apps/slides/src/__tests__/nativeMock";
import { expect, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { FocusSurfaceContext } from "../focus";
import { PresentationProvider } from "../runtime";
import { useSharedElementEntrance } from "../useSharedElementEntrance";

test("a retained matched entrance freezes outgoing and resets on its next live activation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = observable({ playbackPhase: "playing", isPreparing: false, startedAt: 10 });
  const surface = {};
  const motion = { elements: new Map([["title", {}]]) };
  function Probe() { return <entrance enabled={useSharedElementEntrance("title")} />; }
  const render = matched => <PresentationProvider value={runtime$}>
    <FocusSurfaceContext.Provider value={{ surface, motion: matched ? motion : undefined }}><Probe /></FocusSurfaceContext.Provider>
  </PresentationProvider>;
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    await act(() => { tree = create(render(true)); });
    expect(tree.root.findByType("entrance").props.enabled).toBe(false);
    await act(() => tree.update(render(false)));
    expect(tree.root.findByType("entrance").props.enabled).toBe(false);
    await act(() => runtime$.assign({ playbackPhase: "outgoing", startedAt: undefined }));
    expect(tree.root.findByType("entrance").props.enabled).toBe(false);
    await act(() => runtime$.assign({ playbackPhase: "playing", startedAt: 20 }));
    expect(tree.root.findByType("entrance").props.enabled).toBe(true);
    await act(() => tree.update(render(true)));
    await act(() => tree.update(render(false)));
    expect(tree.root.findByType("entrance").props.enabled).toBe(false);
    await act(() => runtime$.assign({ playbackPhase: "preparing", isPreparing: true, startedAt: undefined }));
    expect(tree.root.findByType("entrance").props.enabled).toBe(true);
    await act(() => runtime$.assign({ playbackPhase: "playing", isPreparing: false, startedAt: 30 }));
    expect(tree.root.findByType("entrance").props.enabled).toBe(true);
    expect(log.mock.calls.some(args => args.join(" ").includes("Cannot update a component"))).toBe(false);
  } finally {
    if (tree) await act(() => tree.unmount());
    log.mockRestore();
  }
});

test("a new matched activation still suppresses its entrance without a preparation pass", async () => {
  const runtime$ = observable({ playbackPhase: "playing", isPreparing: false, startedAt: 10 });
  function Probe() { return <entrance enabled={useSharedElementEntrance("title")} />; }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    await act(() => { tree = create(<PresentationProvider value={runtime$}>
      <FocusSurfaceContext.Provider value={{ surface: {}, motion: { elements: new Map([["title", {}]]) } }}><Probe /></FocusSurfaceContext.Provider>
    </PresentationProvider>); });
    await act(() => runtime$.assign({ playbackPhase: "outgoing", startedAt: undefined }));
    await act(() => runtime$.assign({ playbackPhase: "playing", startedAt: 20 }));
    expect(tree.root.findByType("entrance").props.enabled).toBe(false);
  } finally {
    if (tree) await act(() => tree.unmount());
    log.mockRestore();
  }
});
