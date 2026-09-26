// @ts-nocheck Native graphs are inspected without a platform renderer.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { interpolateTransition, createTransitionProgress, resolveTransitionStyle } from "@legend-apps/presentation";
import { useRetainedTransitionStyle } from "../useRetainedTransitionStyle";
import { visibleSlideStyle } from "../slideTransitions";

function Layer({ style, preparing = false }) {
  return <layer style={useRetainedTransitionStyle(style, preparing)} />;
}

test("completed fades never restore opacity while moving into preload, but can fade in again", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  const progress = createTransitionProgress(0);
  const outgoing = { opacity: interpolateTransition(progress, { inputRange: [0, 1], outputRange: [1, 0] }) };
  const style = () => tree.root.findByType("layer").props.style;
  try {
    await act(() => { tree = create(<Layer style={outgoing} />); });
    progress.value = 1;
    expect(resolveTransitionStyle(style()).opacity).toBe(0);
    await act(() => tree.update(<Layer preparing style={visibleSlideStyle(progress)} />));
    expect(style()).toBe(outgoing);
    expect(resolveTransitionStyle(style()).opacity).toBe(0);
    // A subsequent transition clock must not affect this dormant native graph.
    const next = createTransitionProgress(0);
    await act(() => tree.update(<Layer preparing style={visibleSlideStyle(next)} />));
    expect(resolveTransitionStyle(style()).opacity).toBe(0);
    // Backward navigation attaches the new fade at zero, then reaches one.
    await act(() => tree.update(<Layer style={{ opacity: interpolateTransition(next, {inputRange:[0,1],outputRange:[0,1]}) }} />));
    expect(resolveTransitionStyle(style()).opacity).toBe(0);
    next.value = 1;
    expect(resolveTransitionStyle(style()).opacity).toBe(1);
    await act(() => tree.update(<Layer style={visibleSlideStyle(next)} />));
    expect(resolveTransitionStyle(style()).opacity).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});

test("an interrupted fade holds its current opacity when relegated to preload", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const progress = createTransitionProgress(0.4);
  let tree;
  try {
    await act(() => { tree = create(<Layer style={{ opacity: interpolateTransition(progress, {inputRange:[0,1],outputRange:[0,1]}) }} />); });
    await act(() => tree.update(<Layer preparing style={visibleSlideStyle(createTransitionProgress(0))} />));
    expect(resolveTransitionStyle(tree.root.findByType("layer").props.style).opacity).toBe(0.4);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});
