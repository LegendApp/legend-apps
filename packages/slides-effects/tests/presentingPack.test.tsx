// @ts-nocheck Controlled native clocks and geometry; native drawing is mocked.
import { expect, spyOn, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { PresentationProvider } from "@legend-apps/presentation";
import "../../../apps/slides/src/__tests__/nativeMock";
import { relativeBounds, calloutBounds } from "../packs/presenting/geometry";

function loadComponent(file, overrides = {}) {
  const filename = `${import.meta.dir}/../packs/presenting/${file}.tsx`;
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false, presets: [require.resolve("@react-native/babel-preset")],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => overrides[name] ?? require(name), module, module.exports);
  return module.exports;
}

test("attention measurements remove viewport scale and keep labels inside the stage", () => {
  const target = relativeBounds({ x: 500, y: 260, width: 400, height: 200 },
    { x: 100, y: 60, width: 2000, height: 1000 }, { width: 1000, height: 500 });
  expect(target).toEqual({ x: 200, y: 100, width: 200, height: 100 });
  for (const side of ["above", "below", "left", "right"]) {
    const label = calloutBounds(target, { width: 1000, height: 500 }, 380, 100, side);
    expect(label.x).toBeGreaterThanOrEqual(12);
    expect(label.y).toBeGreaterThanOrEqual(12);
    expect(label.x + label.width).toBeLessThanOrEqual(988);
    expect(label.y + label.height).toBeLessThanOrEqual(488);
  }
});

test("freeze clock resumes without counting paused time and resets on slide re-entry", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { FreezeFrame } = loadComponent("FreezeFrame", { "./Motion": { useMotion: (target) => ({value: target}) } });
  const clock = { value: { phase: "playing", slideKey: "a", slideTime: 0 } };
  let reaction;
  const { FreezeFrame: ControlledFreezeFrame } = loadComponent("FreezeFrame", {
    "./Motion": { useMotion: target => ({value: target}) },
    "@legend-apps/presentation": { usePlayback: () => clock },
    "react-native-reanimated": {
      useSharedValue: value => React.useRef({value}).current,
      useDerivedValue: read => ({get value() { return read(); }}),
      useAnimatedReaction: (read, react) => { reaction = () => react(read()); },
    },
    "./FrameView": { FrameView: "frame-view" },
  });
  const render = paused => <ControlledFreezeFrame paused={paused}>{seconds => <clock seconds={seconds} />}</ControlledFreezeFrame>;
  let tree;
  try {
    await act(() => { tree = create(render(false)); });
    const seconds = () => tree.root.findByType("clock").props.seconds.value;
    reaction();
    clock.value.slideTime = 0.5; reaction();
    expect(seconds()).toBe(0.5);
    await act(() => tree.update(render(true))); reaction();
    clock.value.slideTime = 10.5; reaction();
    expect(seconds()).toBe(0.5);
    await act(() => tree.update(render(false))); reaction();
    clock.value.slideTime = 10.75; reaction();
    expect(seconds()).toBe(0.75);
    clock.value = {phase: "playing", slideKey: "b", slideTime: 0}; reaction();
    expect(seconds()).toBe(0);
    clock.value.phase = "preview";
    expect(seconds()).toBe(1.5);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("content replacement keeps both branches mounted and transfers interaction", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { ContentSwap } = loadComponent("Composition", { "./Motion": { useMotion: (target) => ({value: target}) } });
  let mounts = 0;
  function Content({ name }) { React.useEffect(() => { mounts++; }, []); return <content name={name} />; }
  const content = (active) => <ContentSwap active={active} before={<Content name="chart" />} after={<Content name="takeaway" />} />;
  let tree;
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    await act(() => { tree = create(content(false)); });
    for (const active of [true, false, true]) {
      await act(() => tree.update(content(active)));
      expect(mounts).toBe(2);
      const branches = tree.root.findAllByType("animated-view").filter((node) => node.props.pointerEvents);
      expect(branches.map((node) => node.props.pointerEvents)).toEqual(active ? ["none", "auto"] : ["auto", "none"]);
    }
  } finally { if (tree) await act(() => tree.unmount()); log.mockRestore(); }
});


test("progressive detail has zero layout width when collapsed", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { ProgressiveDetail } = loadComponent("Composition", { "./Motion": { useMotion: (target) => ({value: target}) } });
  let tree;
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const content = (expanded) => <ProgressiveDetail expanded={expanded} summary={<summary />} detail={<detail />} />;
    await act(() => { tree = create(content(false)); });
    const detail = () => tree.root.findAllByType("animated-view").find((node) => node.props.importantForAccessibility);
    expect(detail().props.style[1].value.width).toBe("0%");
    expect(detail().props.pointerEvents).toBe("none");
    await act(() => tree.update(content(true)));
    expect(detail().props.style[1].value.width).toBe("63%");
    expect(detail().props.pointerEvents).toBe("auto");
  } finally { if (tree) await act(() => tree.unmount()); log.mockRestore(); }
});
