// @ts-nocheck Exercise Journey generation ownership with a delayed GPU preparation.
import "../../../apps/slides/src/__tests__/nativeMock";
import "../../../apps/slides/src/__tests__/uiClockMock";
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { GPUShaderProvider, PresentationObservableProvider } from "@legend-apps/presentation";
import { usePreparationTask } from "../../presentation/src/PreparationBoundary";
import React from "react";
import { act, create } from "react-test-renderer";
import { Sphere, Journey } from "../packs/journey/Journey";

test("retained Journey worklets become inactive while the incoming GPU generation prepares", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const pending$ = observable(false);
  const runtime$ = observable({ slideIndex: 0, stepIndex: 0, isActive: true, playbackPhase: "playing" });
  let original, tree;
  function Renderer(props) {
    original ??= props.renderGraph;
    usePreparationTask(useValue(pending$) && props.renderGraph !== original);
    return <gpu {...props} />;
  }
  const content = quality => <PresentationObservableProvider value={runtime$}><GPUShaderProvider renderer={Renderer}><Journey quality={quality}><Sphere /></Journey></GPUShaderProvider></PresentationObservableProvider>;
  try {
    await act(() => { tree = create(content("high")); });
    expect(tree.root.findByType("gpu").props.active).toBe(true);
    await act(() => { pending$.set(true); tree.update(content("low")); });
    const generations = tree.root.findAllByType("gpu");
    expect(generations).toHaveLength(2);
    expect(generations.map(node => node.props.active)).toEqual([false, true]);
    await act(() => pending$.set(false));
    expect(tree.root.findAllByType("gpu")).toHaveLength(1);
    expect(tree.root.findByType("gpu").props.active).toBe(true);
  } finally { await act(() => tree?.unmount()); }
});
