// @ts-nocheck Host leaves are replaced by render-count probes.
import { expect, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { PresentationObservableProvider, PresentationProvider, usePresentationValue } from "../runtime";

for (const snapshots of [false, true]) {
  test(`${snapshots ? "snapshot" : "observable"} runtime updates only consumers of changed fields`, async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const runtime$ = observable({ isActive: true, isPreview: false, stepIndex: 0 });
    const renders = { active: 0, step: 0 };
    function Active() { renders.active++; return <active value={usePresentationValue("isActive")} />; }
    function Step() { renders.step++; return <step value={usePresentationValue("stepIndex")} />; }
    const children = <><Active /><Step /></>;
    const content = () => snapshots
      ? <PresentationProvider value={{ ...runtime$.peek() }}>{children}</PresentationProvider>
      : <PresentationObservableProvider value={runtime$}>{children}</PresentationObservableProvider>;
    const log = spyOn(console, "error").mockImplementation(() => {});
    let tree;
    try {
      await act(() => { tree = create(content()); });
      renders.active = renders.step = 0;
      for (const step of [1, 2, 3]) {
        await act(() => { runtime$.stepIndex.set(step); if (snapshots) tree.update(content()); });
        expect(tree.root.findByType("step").props.value).toBe(step);
      }
      expect(renders).toEqual({ active: 0, step: 3 });
      await act(() => { runtime$.isActive.set(false); if (snapshots) tree.update(content()); });
      expect(tree.root.findByType("active").props.value).toBe(false);
      expect(renders).toEqual({ active: 1, step: 3 });
    } finally {
      if (tree) await act(() => tree.unmount());
      log.mockRestore();
    }
  });
}
