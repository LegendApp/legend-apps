// @ts-nocheck Native progress events are supplied explicitly for lifecycle tests.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
import { reactUI } from "./uiClockMock";
import { useNativeTransitionReady } from "../useNativeTransitionReady";
function Gate({ progress, transitioning = true }) {
  return <gate visible={useNativeTransitionReady(progress, transitioning)} />;
}
test("incoming content stays hidden until native progress, then stops observing frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const progress = { value: 0 };
  let tree;
  try {
    await act(() => { tree = create(<Gate progress={progress} />); });
    expect(tree.root.findByType("gate").props.visible).toBe(false);
    await act(() => { progress.value = 0; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(false);
    await act(() => { progress.value = 0.02; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(true);

  } finally { if (tree) await act(() => tree.unmount()); }
});
test("reversals require their own native signal and ignore stale callbacks; cuts reveal immediately", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const old = { value: 0 }, next = { value: 0 };
  let tree;
  try {
    await act(() => { tree = create(<Gate progress={old} />); });

    await act(() => tree.update(<Gate progress={next} />));
    await act(() => { old.value = 0.5; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(false);

    await act(() => { next.value = 0.01; reactUI(); });
    expect(tree.root.findByType("gate").props.visible).toBe(true);
    await act(() => tree.update(<Gate progress={{ value: 1 }} transitioning={false} />));
    expect(tree.root.findByType("gate").props.visible).toBe(true);
  } finally { if (tree) await act(() => tree.unmount()); }
});
