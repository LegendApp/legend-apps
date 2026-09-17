// @ts-nocheck Native leaves are mocked; captions must respond without advancing time.
import { expect, spyOn, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import { PresentationProvider } from "@legend-apps/presentation";
import "./nativeMock";
const { GlassCaption } = await import("../../decks/react-native-desktop/GlassCaption");

test("glass acknowledges the trigger immediately and resets on backward navigation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  const epoch = performance.now();
  const runtime$ = observable({});
  const render = (stepIndex, isPreview = false) => {
    runtime$.set({ isActive: !isPreview, isPreview, stepIndex, stepEpochs: { 1: epoch } });
    return <PresentationProvider value={runtime$}>
      <GlassCaption />
    </PresentationProvider>;
  };
  let renderer;
  try {
    await act(() => { renderer = create(render(0)); });
    expect(renderer.toJSON()).toBe("We can fake the glass");
    await act(() => renderer.update(render(1)));
    expect(renderer.toJSON()).toBe("More refraction should help");
    await act(() => renderer.update(render(0)));
    expect(renderer.toJSON()).toBe("We can fake the glass");
    await act(() => renderer.update(render(1)));
    expect(renderer.toJSON()).toBe("More refraction should help");
    await act(() => renderer.update(render(1, true)));
    expect(renderer.toJSON()).toBe("Perfect. Ship it.");
    await act(() => renderer.update(render(0, true)));
    expect(renderer.toJSON()).toBe("We can fake the glass");
  } finally {
    if (renderer) await act(() => renderer.unmount());
    log.mockRestore();
  }
});
