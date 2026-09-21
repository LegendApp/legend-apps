import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import React from "react";

const require = createRequire(new URL("../../../../apps/slides/package.json", import.meta.url));
const { act, create } = require("react-test-renderer");

// Deliberately queue provider UI transactions behind React commits. This
// reproduces the scheduling order that previously exposed old step time.
test("every public clock consumer starts at the new step before the UI reset arrives", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const pending = [];
  const loops = [];
  let current = { playbackPhase: "playing", slideIndex: 1, startedAt: 100, stepIndex: 0, stepStartedAt: 100 };
  const runtime$ = new Proxy({}, { get: (_, key) => ({ get: () => current[key] }) });
  const seen = {};
  const modules = {};
  const mocks = {
    react: React,
    "@legendapp/state/react": { useValue: read => read() },
    "react-native-reanimated": {
      __esModule: true, default: { View: "animated" },
      runOnUI: fn => () => pending.push(fn),
      useSharedValue: initial => React.useRef({ value: initial }).current,
      useDerivedValue: (read, dependencies) => React.useMemo(() => ({ get value() { return read(); } }), dependencies),
      useAnimatedStyle: read => read(),
      useFrameCallback: callback => {
        const latest = React.useRef(callback); latest.current = callback;
        return React.useMemo(() => {
          const loop = { active: false, setActive(active) { this.active = active; }, tick(timestamp) { if (this.active) latest.current({ timestamp }); } };
          loops.push(loop); return loop;
        }, []);
      },
    },
  };
  function load(name) {
    if (modules[name]) return modules[name];
    const code = transformSync(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"), { loader: name.endsWith("tsx") ? "tsx" : "ts", format: "cjs", jsx: "automatic" }).code;
    const module = { exports: {} };
    Function("require", "module", "exports", code)(id => id === "./playbackState" ? load("playbackState.ts") : id === "./playback" ? load("playback.tsx") : mocks[id] ?? require(id), module, module.exports);
    return modules[name] = module.exports;
  }
  const { PlaybackProvider, usePlayback } = load("playback.tsx");
  const { PlaybackKeyframeView } = load("PlaybackKeyframeView.tsx");
  function Probe({ name }) { seen[name] = usePlayback().value; return null; }
  const content = () => React.createElement(PlaybackProvider, { runtime$ },
    React.createElement(Probe, { name: "shader" }), React.createElement(Probe, { name: "custom" }),
    React.createElement(PlaybackKeyframeView, { keyframes: [{ time: 0, x: 12, y: 34, opacity: 1 }] }),
    React.createElement(PlaybackKeyframeView, { delay: 1500, keyframes: [{ time: 0, x: 0, y: 0, opacity: 1 }] }));
  const flushUI = () => { for (const fn of pending.splice(0)) fn(); };
  let renderer;
  try {
    await act(() => { renderer = create(content()); });
    flushUI(); loops[0].tick(1000); loops[0].tick(21000);
    current = { ...current, stepIndex: 1, stepStartedAt: 200 };
    await act(() => renderer.update(content()));
    assert.equal(pending.length, 1, "UI clock reset must still be queued for the regression");
    assert.equal(loops.length, 1, "consumers do not create independent frame loops");
    assert.equal(seen.shader.stepTime, 0);
    assert.deepEqual(seen.custom, seen.shader);
    assert.equal(seen.shader.slideTime, 20);
    const views = renderer.root.findAllByType("animated");
    assert.equal(views[0].props.style[1].opacity, 1, "visible first pose must not be hidden pending synchronization");
    assert.equal(views[1].props.style[1].opacity, 0, "authored delay must not read the old elapsed time");
    flushUI(); loops[0].tick(22000); loops[0].tick(22500);
    await act(() => renderer.update(content()));
    assert.equal(seen.shader.stepTime, 0.5);
    current = { ...current, stepStartedAt: 300 };
    await act(() => renderer.update(content()));
    assert.equal(seen.shader.stepTime, 0, "replay at the same step receives a new identity");
    flushUI();
    current = { ...current, stepIndex: 0, stepStartedAt: 400 };
    await act(() => renderer.update(content()));
    assert.equal(seen.shader.stepTime, 0, "back navigation begins at zero");
    assert.equal(seen.shader.stepOrigins[1], undefined);
    flushUI();
    current = { ...current, playbackPhase: "outgoing", startedAt: undefined, stepStartedAt: undefined };
    await act(() => renderer.update(content()));
    assert.equal(seen.shader.slideTime, 21.5, "outgoing content preserves the last live frame");
  } finally { if (renderer) await act(() => renderer.unmount()); }
});
