// @ts-nocheck Real React effects with a deterministic idle scheduler.
import "../../../../apps/slides/src/__tests__/nativeMock";
import { expect, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { PresentationProvider } from "../runtime";
import { PreparationBoundary, usePreparationTask } from "../PreparationBoundary";
import { ProgressivePreparation } from "../ProgressivePreparation";
import { idleCallbacks, flushIdleCallbacks } from "../../../../apps/slides/src/__tests__/nativeMock";

test("readiness waits for every incremental child and asynchronous resource, without remounting prepared children", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  const runtime$ = observable({ isPreparing: true, playbackPhase: "preparing" });
  let ready = 0, mounts = 0, tree;
  function Resource({ waiting }) { usePreparationTask(waiting); return null; }
  function Item() { React.useEffect(() => { mounts++; }, []); return <item />; }
  const items = [0,1,2].map(id => <Item key={id} />);
  const render = waiting => <PresentationProvider value={runtime$}><PreparationBoundary onReady={() => ready++}>
    <ProgressivePreparation>{items}</ProgressivePreparation><Resource waiting={waiting} />
  </PreparationBoundary></PresentationProvider>;
  try {
    await act(() => { tree = create(render(true)); });
    for (let i=0; i<3; i++) { expect(ready).toBe(0); await act(flushIdleCallbacks); }
    expect(mounts).toBe(3); expect(ready).toBe(0);
    await act(() => tree.update(render(false)));
    expect(ready).toBe(1);
    await act(() => runtime$.assign({ isPreparing: false, playbackPhase: "playing" }));
    expect(mounts).toBe(3); expect(ready).toBe(1); expect(idleCallbacks.size).toBe(0);
  } finally { await act(() => tree?.unmount()); log.mockRestore(); }
});

test("replaced and unmounted preparation never delivers a stale readiness callback", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  let stale = 0, current = 0, tree;
  function Resource({ waiting }) { usePreparationTask(waiting); return null; }
  try {
    await act(() => { tree = create(<PreparationBoundary onReady={() => stale++}><Resource waiting /></PreparationBoundary>); });
    await act(() => tree.update(<PreparationBoundary onReady={() => current++}><Resource waiting={false} /></PreparationBoundary>));
    expect(stale).toBe(0); expect(current).toBe(1);
    await act(() => tree.update(<PreparationBoundary onReady={() => stale++}><Resource waiting /></PreparationBoundary>));
    await act(() => tree.unmount());
    expect(stale).toBe(0);
  } finally { log.mockRestore(); }
});
