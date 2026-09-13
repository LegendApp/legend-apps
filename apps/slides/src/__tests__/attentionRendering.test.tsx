// @ts-nocheck Exercise compiled annotations with deterministic native measurements.
import { expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import React from "react";
import * as state from "@legendapp/state";
import * as stateReact from "@legendapp/state/react";
import { act, create } from "react-test-renderer";
import * as geometry from "../../decks/react-native-desktop/packs/presenting/geometry";

test("annotations subscribe to their target while resizing and target removal still update geometry", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const filename = fileURLToPath(new URL("../../decks/react-native-desktop/packs/presenting/Attention.tsx", import.meta.url));
  const require = createRequire(filename);
  const source = 'import { recordRender } from "render-probe";\n' + readFileSync(filename, "utf8")
    .replace('  const box = useValue(() => target ?', '  recordRender("spotlight", target);\n  const box = useValue(() => target ?')
    .replace('  const box = useValue(() => measurements$', '  recordRender("callout", target);\n  const box = useValue(() => measurements$');
  const { code } = transformSync(source, {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [[require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }]],
  });
  expect(code).toContain("react/compiler-runtime");
  const renders = {};
  const recordRender = (kind, target) => { const key = `${kind}:${target}`; renders[key] = (renders[key] ?? 0) + 1; };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => ({
    "render-probe": { recordRender },
    "@legendapp/state": state, "@legendapp/state/react": stateReact,
    "react-native": { View: "view", Text: "text", StyleSheet: { create: (styles) => styles, absoluteFill: {} } },
    "@legend-apps/presentation": { usePresentationValue: (key) => key === "isActive" },
    "@shopify/react-native-skia": { Canvas: "canvas", Path: "path", DiffRect: "diff-rect", RoundedRect: "rounded-rect", rect: (...args) => args, rrect: (...args) => args },
    "./geometry": geometry, "./motion": { useMotion: (values) => values },
  }[name] ?? require(name)), module, module.exports);
  const { AttentionStage, AttentionTarget, Callout, Spotlight } = module.exports;
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let nextFrame = 0, movingX = 10;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const log = spyOn(console, "error").mockImplementation(() => {});
  const tick = async (now) => act(() => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(now)); });
  const content = (showMoving = true) => <AttentionStage>
    {showMoving && <AttentionTarget id="moving" style={{ tag: "moving" }}>A</AttentionTarget>}
    <AttentionTarget id="static" style={{ tag: "static" }}>B</AttentionTarget>
    <Callout target="moving">Moving</Callout><Callout target="static">Static</Callout>
    <Spotlight target="moving" />
  </AttentionStage>;
  let tree;
  const resize = async (width, height) => {
    const stage = tree.root.findAllByType("view").find((node) => node.props.collapsable === false && node.props.onLayout);
    await act(() => stage.props.onLayout({ nativeEvent: { layout: { width, height } } }));
  };
  try {
    await act(() => { tree = create(content(), { createNodeMock: (element) => ({ measureInWindow: (callback) => {
      const tag = element.props.style?.tag;
      callback(...(tag === "moving" ? [movingX, 80, 100, 50] : tag === "static" ? [600, 80, 100, 50] : [0, 0, 1000, 600]));
    } }) }); });
    await resize(1000, 600);
    await tick(40);
    Object.keys(renders).forEach((key) => delete renders[key]);
    for (let i = 1; i <= 5; i++) { movingX += 10; await tick(40 + i * 40); }
    expect(renders).toEqual({ "callout:moving": 5, "spotlight:moving": 5 });
    const oldPath = tree.root.findAllByType("path")[1].props.path;
    await resize(800, 500);
    await tick(300);
    expect(renders["callout:static"]).toBeGreaterThan(0);
    expect(tree.root.findAllByType("path")[1].props.path).not.toBe(oldPath);
    await act(() => tree.update(content(false)));
    await tick(340);
    expect(tree.root.findAllByType("path")).toHaveLength(1);
    // An unchanged measurement must not wake the remaining annotations.
    Object.keys(renders).forEach((key) => delete renders[key]);
    await tick(380);
    expect(renders).toEqual({});
  } finally {
    if (tree) await act(() => tree.unmount());
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
    log.mockRestore();
  }
  expect(frames.size).toBe(0);
});
