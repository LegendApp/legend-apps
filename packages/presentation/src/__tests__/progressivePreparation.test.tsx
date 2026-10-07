// @ts-nocheck The idle scheduler is deterministic; React state and subscriptions are real.
import "../../../../apps/slides/src/__tests__/nativeMock";
import { expect, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { PresentationProvider } from "../runtime";
import { ProgressivePreparation } from "../ProgressivePreparation";

async function harness(run, strict = false) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const originalRequest = globalThis.requestIdleCallback, originalCancel = globalThis.cancelIdleCallback;
  const jobs = new Map();
  let next = 0;
  globalThis.requestIdleCallback = callback => { jobs.set(++next, callback); return next; };
  globalThis.cancelIdleCallback = id => jobs.delete(id);
  const runtime$ = observable({ isPreparing: true, playbackPhase: "preparing" });
  const mounts = [], unmounts = [], renders = [];
  function Item({ id }) {
    renders.push(id);
    React.useEffect(() => { mounts.push(id); return () => { unmounts.push(id); }; }, []);
    return <item id={id} />;
  }
  const children = [0, 1, 2, 3].map(id => <Item key={id} id={id} />);
  const content = <PresentationProvider value={runtime$}><ProgressivePreparation>{children}</ProgressivePreparation></PresentationProvider>;
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  const idle = () => act(() => {
    const [id, callback] = jobs.entries().next().value;
    jobs.delete(id);
    callback({ didTimeout: false, timeRemaining: () => 50 });
  });
  try {
    await act(() => { tree = create(strict ? <React.StrictMode>{content}</React.StrictMode> : content); });
    await run({ runtime$, jobs, mounts, unmounts, renders, idle,
      items: () => tree.root.findAllByType("item").map(item => item.props.id),
      unmount: () => act(() => tree.unmount()) });
  } finally {
    if (tree) await act(() => tree.unmount());
    globalThis.requestIdleCallback = originalRequest;
    globalThis.cancelIdleCallback = originalCancel;
    log.mockRestore();
  }
}

test("preparation mounts one keyed child per idle commit without rerendering earlier children", () => harness(async h => {
  expect(h.items()).toEqual([]);
  for (let count = 1; count <= 4; count++) {
    expect(h.jobs.size).toBe(1);
    await h.idle();
    expect(h.items()).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(h.mounts).toEqual(h.items());
    expect(h.renders).toEqual(h.items());
  }
  expect(h.jobs.size).toBe(0);
}));

for (const phase of ["preview", "playing", "outgoing"]) {
  test(`${phase} promotes a partial tree immediately without remounting prepared children`, () => harness(async h => {
    await h.idle();
    const stale = h.jobs.values().next().value;
    await act(() => h.runtime$.assign({ isPreparing: false, playbackPhase: phase }));
    expect(h.items()).toEqual([0, 1, 2, 3]);
    expect(h.mounts).toEqual([0, 1, 2, 3]);
    expect(h.unmounts).toEqual([]);
    expect(h.jobs.size).toBe(0);
    await act(() => stale());
    expect(h.renders).toEqual([0, 1, 2, 3]);
    await act(() => h.runtime$.assign({ isPreparing: true, playbackPhase: "preparing" }));
    expect(h.items()).toEqual([0, 1, 2, 3]);
    expect(h.jobs.size).toBe(0);
  }));
}

test("unmount cancels preparation and stale callbacks cannot construct more children", () => harness(async h => {
  await h.idle();
  const stale = h.jobs.values().next().value;
  await h.unmount();
  expect(h.jobs.size).toBe(0);
  await act(() => stale());
  expect(h.mounts).toEqual([0]);
  expect(h.unmounts).toEqual([0]);
}));

test("StrictMode effect replay leaves one current idle job and preparation converges", () => harness(async h => {
  expect(h.jobs.size).toBe(1);
  for (let i = 0; i < 4; i++) await h.idle();
  expect(h.items()).toEqual([0, 1, 2, 3]);
  expect(h.jobs.size).toBe(0);
}, true));
