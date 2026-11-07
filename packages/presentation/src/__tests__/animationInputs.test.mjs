import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { transformSync as transformBabel } from "@babel/core";

const require = createRequire(new URL("../../../../apps/slides/package.json", import.meta.url));
const presentationRequire = createRequire(new URL("../../package.json", import.meta.url));
const { act, create } = require("react-test-renderer");

function load(name, mocks) {
  const source = readFileSync(new URL(`../${name}.tsx`, import.meta.url), "utf8");
  const compiled = transformBabel(source, {
    filename: new URL(`../${name}.tsx`, import.meta.url).pathname,
    configFile: false, babelrc: false,
    presets: [presentationRequire.resolve("@react-native/babel-preset")],
    plugins: [[presentationRequire.resolve("babel-plugin-react-compiler"), { target: "19" }],
      presentationRequire.resolve("react-native-worklets/plugin")],
  }).code;
  const module = { exports: {} };
  Function("require", "module", "exports", compiled)(id => mocks[id] ?? require(id), module, module.exports);
  return module.exports;
}

test("equal scene poses reuse tween inputs while changed coordinates and opacity update", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let target;
  const { SceneMotionView } = load("SceneMotionView", {
    "./usePlaybackTween": { usePlaybackTween(value) { target = value; return { value }; } },
    "react-native-reanimated": { __esModule: true, default: { View: "animated" }, useAnimatedStyle: read => read() },
  });
  let renderer;
  try {
    await act(() => { renderer = create(React.createElement(SceneMotionView, { pose: { opacity: 0.65 } })); });
    const first = target;
    await act(() => renderer.update(React.createElement(SceneMotionView, { pose: { opacity: 0.65 } })));
    assert.equal(target, first, "fresh equal props must not reinstall tween mappers");
    await act(() => renderer.update(React.createElement(SceneMotionView, { pose: { y: 45, opacity: 1 } })));
    assert.notEqual(target, first);
    assert.deepEqual(target, { x: 0, y: 45, scaleX: 1, scaleY: 1, opacity: 1 });
    await act(() => renderer.update(React.createElement(SceneMotionView, { pose: { x: 12, y: 45, scaleX: 2, scaleY: 3, opacity: 1 } })));
    assert.deepEqual(target, { x: 12, y: 45, scaleX: 2, scaleY: 3, opacity: 1 });
  } finally { if (renderer) await act(() => renderer.unmount()); }
});

test("a delayed keyframe retains its waiting pose through unrelated renders", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const playback = { value: { stepTime: 0 } };
  let pose;
  const { PlaybackKeyframeView } = load("PlaybackKeyframeView", {
    "./playback": { usePlayback: () => playback, samplePlayback: value => value.stepTime },
    "react-native-reanimated": { __esModule: true, default: { View: "animated" },
      useDerivedValue(read) { pose = read(); return { value: pose }; }, useAnimatedStyle: read => read() },
  });
  const keyframes = [{ time: 0, x: 12, y: 34, opacity: 1 }, { time: 800, x: 90, y: 10, opacity: 0 }];
  let renderer;
  const content = frames => React.createElement(PlaybackKeyframeView, { keyframes: frames, delay: 500 });
  try {
    await act(() => { renderer = create(content(keyframes)); });
    const first = pose;
    await act(() => renderer.update(content(keyframes)));
    assert.equal(pose, first, "unchanged waiting coordinates must not reinstall the derived mapper");
    await act(() => renderer.update(content([{ ...keyframes[0], x: 22, y: 44 }, keyframes[1]])));
    assert.notEqual(pose, first);
    assert.deepEqual(pose, { x: 22, y: 44, opacity: 0 });
  } finally { if (renderer) await act(() => renderer.unmount()); }
});

function focusInputs() {
  const inputs = [];
  const components = load("focus", {
    "./transitionValues": { useTransitionStyle: style => { inputs.push(style); return style; } },
    "./focusMotionStyles": { focusCameraStyle: () => undefined },
    "./focusGeometry": {},
    "./nativeChildren": { renderNativeChildren: children => children },
    "react-native": { View: "view", Text: "text", StyleSheet: { flatten: style => style } },
    "react-native-reanimated": { __esModule: true, default: { View: "animated" } },
  });
  return { ...components, inputs };
}

test("an idle focus camera retains its transform input through content updates", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { FocusStage, inputs } = focusInputs();
  let renderer;
  try {
    await act(() => { renderer = create(React.createElement(FocusStage, null, "first")); });
    const first = inputs.at(-1);
    await act(() => renderer.update(React.createElement(FocusStage, null, "second")));
    assert.equal(inputs.at(-1), first);
  } finally { if (renderer) await act(() => renderer.unmount()); }
});

test("marker layout changes retain the empty transform but authored transforms update", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { SharedElement, inputs } = focusInputs();
  let renderer;
  const content = style => React.createElement(SharedElement, { id: "title", style }, "title");
  try {
    await act(() => { renderer = create(content({ left: 0 })); });
    const first = inputs.at(-1);
    await act(() => renderer.update(content({ left: 10 })));
    assert.equal(inputs.at(-1), first);
    await act(() => renderer.update(content({ transform: [{ scale: 2 }] })));
    assert.deepEqual(inputs.at(-1).transform, [{ scale: 2 }]);
  } finally { if (renderer) await act(() => renderer.unmount()); }
});
