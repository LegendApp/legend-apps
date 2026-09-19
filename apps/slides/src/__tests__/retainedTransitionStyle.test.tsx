// @ts-nocheck Native graphs are inspected without a platform renderer.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { Animated } from "react-native";
import { useRetainedTransitionStyle } from "../useRetainedTransitionStyle";
import { visibleSlideStyle } from "../slideTransitions";

function Layer({ style, preparing = false }) {
  return <layer style={useRetainedTransitionStyle(style, preparing)} />;
}

test("completed fades never restore opacity while moving into preload, but can fade in again", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  const progress = new Animated.Value(0);
  const outgoing = { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  const style = () => tree.root.findByType("layer").props.style;
  try {
    await act(() => { tree = create(<Layer style={outgoing} />); });
    progress.setValue(1);
    expect(style().opacity.__getValue()).toBe(0);
    await act(() => tree.update(<Layer preparing style={visibleSlideStyle(progress)} />));
    expect(style()).toBe(outgoing);
    expect(style().opacity.__getValue()).toBe(0);
    // A subsequent transition clock must not affect this dormant native graph.
    const next = new Animated.Value(0);
    await act(() => tree.update(<Layer preparing style={visibleSlideStyle(next)} />));
    expect(style().opacity.__getValue()).toBe(0);
    // Backward navigation attaches the new fade at zero, then reaches one.
    await act(() => tree.update(<Layer style={{ opacity: next }} />));
    expect(style().opacity.__getValue()).toBe(0);
    next.setValue(1);
    expect(style().opacity.__getValue()).toBe(1);
    await act(() => tree.update(<Layer style={visibleSlideStyle(next)} />));
    expect(style().opacity.__getValue()).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});

test("an interrupted fade holds its current opacity when relegated to preload", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const progress = new Animated.Value(0.4);
  let tree;
  try {
    await act(() => { tree = create(<Layer style={{ opacity: progress }} />); });
    await act(() => tree.update(<Layer preparing style={visibleSlideStyle(new Animated.Value(0))} />));
    expect(tree.root.findByType("layer").props.style.opacity.__getValue()).toBe(0.4);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});
