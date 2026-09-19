// @ts-nocheck Native progress events are supplied explicitly for lifecycle tests.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { Animated } from "react-native";
import { useNativeTransitionReady } from "../useNativeTransitionReady";
function Gate({ progress, transitioning = true }) {
  return <gate visible={useNativeTransitionReady(progress, transitioning)} />;
}
test("incoming content stays hidden until native progress, then stops observing frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const progress = new Animated.Value(0);
  let tree;
  try {
    await act(() => { tree = create(<Gate progress={progress} />); });
    expect(tree.root.findByType("gate").props.visible).toBe(false);
    await act(() => progress.setValue(0));
    expect(tree.root.findByType("gate").props.visible).toBe(false);
    await act(() => progress.setValue(0.02));
    expect(tree.root.findByType("gate").props.visible).toBe(true);
    expect(progress.listeners.size).toBe(0);
  } finally { if (tree) await act(() => tree.unmount()); }
});
test("reversals require their own native signal and ignore stale callbacks; cuts reveal immediately", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const old = new Animated.Value(0), next = new Animated.Value(0);
  let tree;
  try {
    await act(() => { tree = create(<Gate progress={old} />); });
    const stale = [...old.listeners.values()][0];
    await act(() => tree.update(<Gate progress={next} />));
    await act(() => stale({ value: 0.5 }));
    expect(tree.root.findByType("gate").props.visible).toBe(false);
    expect(old.listeners.size).toBe(0);
    await act(() => next.setValue(0.01));
    expect(tree.root.findByType("gate").props.visible).toBe(true);
    await act(() => tree.update(<Gate progress={new Animated.Value(1)} transitioning={false} />));
    expect(tree.root.findByType("gate").props.visible).toBe(true);
  } finally { if (tree) await act(() => tree.unmount()); }
});
