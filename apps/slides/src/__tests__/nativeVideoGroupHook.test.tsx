// @ts-nocheck Controlled loading and UI runtimes exercise the actual hook lifecycle.
import { expect, mock, test } from "bun:test";
import React, { useMemo, useRef } from "react";
import { act, create } from "react-test-renderer";
import { createRequire } from "node:module";
const presentationRequire = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const loads = [], callbacks = [], players = [];
let now = 0, deferUI = false;
const uiTasks = [];
function player(source) {
  const native = {
    source, ready: false, starts: [], prepares: [], disposed: 0,
    duration: () => source === "short" ? 1320 : 11380,
    syncStatus() { return this.ready ? 1 : 0; },
    prepareSync(time) { this.ready = false; this.prepares.push(time); },
    playSync(time, host) { this.starts.push([time, host]); },
    syncHostTime: () => now,
    setLooping() {}, setVolume() {}, nextImage: () => ({ source }),
    dispose() { this.disposed++; },
  };
  if (source === "old-binary") delete native.prepareSync;
  if (source === "broken") throw new Error("bad fixture");
  players.push(native); return native;
}
mock.module(presentationRequire.resolve("react-native"), () => ({ Platform: { OS: "macos" } }));
mock.module(presentationRequire.resolve("@shopify/react-native-skia"), () => ({ Skia: { Video: player } }));
mock.module(presentationRequire.resolve("react-native-reanimated"), () => ({
  createWorkletRuntime: () => ({}), runOnJS: fn => fn,
  runOnUI: fn => (...args) => deferUI ? uiTasks.push(() => fn(...args)) : fn(...args),
  runOnRuntime: (_, fn) => (...args) => loads.push(() => fn(...args)),
  makeMutable: value => ({ value }),
  useSharedValue: value => useRef({ value }).current,
  useFrameCallback: fn => {
    const latest = useRef(fn); latest.current = fn;
    return useMemo(() => {
      const callback = { active: false, setActive(active) { this.active = active; }, tick() { if (this.active) latest.current(); } };
      callbacks.push(callback); return callback;
    }, []);
  },
}));
const { useNativeVideoGroup } = await import("../../../../packages/presentation/src/useNativeVideoGroup");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test("hook publishes a group frame only after the whole native barrier and resets on exit", async () => {
  let value, tree;
  function Probe({ active = true, resetKey = "one" }) { value = useNativeVideoGroup(["short", "long"], { active, resetKey }); return null; }
  await act(() => { tree = create(<Probe />); });
  await act(() => loads.shift()());
  const native = players.slice(-2), callback = callbacks.at(-1);
  native[0].ready = true; now = 10; await act(() => callback.tick());
  expect(value.frames.value).toEqual([]);
  native[1].ready = true; now = 20; await act(() => callback.tick());
  expect(value.frames.value).toEqual([{ source: "short" }, { source: "long" }]);
  expect(native.map(p => p.starts)).toEqual([[[0, 120]], [[0, 120]]]);
  await act(() => tree.update(<Probe active={false} />));
  expect(callback.active).toBe(false); expect(value.frames.value).toEqual([]);
  expect(native.map(p => p.prepares.at(-1))).toEqual([0, 0]);
  await act(() => tree.update(<Probe resetKey="two" />));
  expect(value.state.value.phase).toBe("preparing");
  expect(native.map(p => p.starts.length)).toEqual([1, 1]);
  await act(() => tree.unmount()); expect(native.map(p => p.disposed)).toEqual([1, 1]);
});
test("cancelled loads release every player; a failed batch releases earlier players", async () => {
  let tree, value;
  function Probe({ sources }) { value = useNativeVideoGroup(sources, { active: true, resetKey: "one" }); return null; }
  await act(() => { tree = create(<Probe sources={["short", "long"]} />); });
  await act(() => tree.unmount()); await act(() => loads.shift()());
  expect(players.slice(-2).map(p => p.disposed)).toEqual([1, 1]);
  await act(() => { tree = create(<Probe sources={["short", "broken"]} />); });
  await act(() => loads.shift()());
  expect(value.error).toContain("bad fixture"); expect(players.at(-1).disposed).toBe(1);
  await act(() => tree.update(<Probe sources={["old-binary"]} />)); await act(() => loads.shift()());
  expect(value.error).toContain("rebuild"); expect(players.at(-1).disposed).toBe(1);
  await act(() => tree.unmount());
});
test("source membership changes dispose the previous cohort and wait for the new cohort", async () => {
  let value, tree;
  function Probe({ sources }) { value = useNativeVideoGroup(sources, { active: true, resetKey: "reveal" }); return null; }
  await act(() => { tree = create(<Probe sources={["short"]} />); });
  await act(() => loads.shift()());
  const old = players.at(-1);
  old.ready = true; await act(() => callbacks.at(-1).tick());
  await act(() => tree.update(<Probe sources={["short", "long"]} />));
  expect(old.disposed).toBe(1); expect(value.frames.value).toEqual([]);
  await act(() => loads.shift()());
  const next = players.slice(-2);
  expect(next.map(p => p.prepares)).toEqual([[0], [0]]);
  next[0].ready = true; await act(() => callbacks.at(-1).tick());
  expect(next.every(p => p.starts.length === 0)).toBe(true);
  next[1].ready = true; await act(() => callbacks.at(-1).tick());
  expect(next.map(p => p.starts.at(-1)[0])).toEqual([0, 0]);
  await act(() => tree.unmount()); expect(next.map(p => p.disposed)).toEqual([1, 1]);
});

test("restart hold publishes the first decoded cohort immediately while native playback waits", async () => {
  let value, tree;
  function Probe() { value = useNativeVideoGroup(["short", "long"], { active: true, resetKey: "hold", restartHoldMs: 500 }); return null; }
  await act(() => { tree = create(<Probe />); });
  try {
    await act(() => loads.shift()());
    const native = players.slice(-2), callback = callbacks.at(-1);
    native.forEach(p => p.ready = true); now = 100; await act(() => callback.tick());
    expect(value.frames.value).toEqual([{ source: "short" }, { source: "long" }]);
    expect(native.map(p => p.starts.at(-1))).toEqual([[0, 600], [0, 600]]);
    now = 599; await act(() => callback.tick());
    expect(value.state.value.position).toBe(0);
    now = 601; await act(() => callback.tick());
    expect(value.state.value.position).toBe(1);
  } finally { await act(() => tree.unmount()); }
});

test("a new source cohort cannot display the previous clip while UI cleanup is pending", async () => {
  let value, tree;
  function Probe({ sources }) { value = useNativeVideoGroup(sources, { active: true, resetKey: "carousel" }); return null; }
  await act(() => { tree = create(<Probe sources={["short"]} />); });
  try {
    await act(() => loads.shift()());
    players.at(-1).ready = true; await act(() => callbacks.at(-1).tick());
    expect(value.frames.value).toEqual([{ source: "short" }]);
    deferUI = true;
    await act(() => tree.update(<Probe sources={["long"]} />));
    expect(value.frames.value).toEqual([]);
  } finally {
    deferUI = false;
    await act(() => { while (uiTasks.length) uiTasks.shift()(); });
    await act(() => loads.shift()());
    await act(() => tree.unmount());
  }
});
