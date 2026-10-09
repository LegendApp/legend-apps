// @ts-nocheck The UI runtime and native measurements are driven deterministically.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import React from "react";
import { act, create } from "react-test-renderer";
import * as geometry from "../packs/presenting/geometry";

test("UI measurements move annotations without React renders and clear removed targets", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const filename = `${import.meta.dir}/../packs/presenting/Attention.tsx`;
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [[require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }]],
  });
  const frames = [];
  let movingX = 10, staticX = 600, styleRenders = 0, measurements = 0;
  const derived = read => ({ get value() { return read(); } });
  const mocks = {
    "react-native": { View: "view", Text: "text", StyleSheet: { create: value => value, absoluteFill: {} } },
    "@legend-apps/presentation": { usePresentationValue: key => key === "isActive" },
    "./geometry": geometry,
    "./FrameView": { FrameView: props => { styleRenders++; return <frame-view {...props} />; } },
    "@shopify/react-native-skia": { Canvas: "canvas", Path: "path", DiffRect: "diff-rect", RoundedRect: "rounded-rect", rect: (...args) => args, rrect: (...args) => args },
    "react-native-reanimated": {
      __esModule: true,
      default: { View: "animated-view" },
      useAnimatedRef: () => React.useRef(null),
      useSharedValue: value => React.useRef({value}).current,
      useAnimatedStyle: derived, useDerivedValue: derived,
      runOnUI: fn => fn,
      measure: ref => { measurements++; return ref.current?.bounds(); },
      useFrameCallback: read => {
        const latest = React.useRef(read); latest.current = read;
        return React.useMemo(() => { const frame = {active: false, setActive(active) { this.active = active; }, tick() { if (this.active) latest.current(); }}; frames.push(frame); return frame; }, []);
      },
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => mocks[name] ?? require(name), module, module.exports);
  const { AttentionStage, AttentionTarget, Callout, Spotlight } = module.exports;
  const render = (moving = true) => <AttentionStage>
    {moving && <AttentionTarget moving id="moving" style={{tag: "moving"}}>A</AttentionTarget>}
    <AttentionTarget id="static" style={{tag: "static"}}>B</AttentionTarget>
    <Callout target="moving">Moving</Callout><Callout target="static">Static</Callout><Spotlight target="moving" />
  </AttentionStage>;
  let tree;
  const tick = () => frames.forEach(frame => frame.tick());
  const resize = async (width, height) => act(() => tree.root.findAllByType("animated-view").find(node => node.props.onLayout).props.onLayout({nativeEvent: {layout: {width, height}}}));
  try {
    await act(() => { tree = create(render(), {createNodeMock: element => ({bounds() {
      const tag = element.props.style?.[0]?.tag;
      return tag ? {pageX: tag === "moving" ? movingX : staticX, pageY: 80, width: 100, height: 50} : {pageX: 0, pageY: 0, width: 1000, height: 600};
    }})}); });
    await resize(1000, 600); tick();
    const paths = () => tree.root.findAllByType("path").map(node => node.props.path.value);
    const before = paths(); const renders = styleRenders;
    measurements = 0;
    movingX += 80; tick();
    expect(measurements).toBe(2);
    expect(paths()[0]).not.toBe(before[0]);
    expect(paths()[1]).toBe(before[1]);
    expect(styleRenders).toBe(renders);
    await resize(800, 500); tick();
    expect(paths()[1]).not.toBe(before[1]);
    await act(() => tree.update(render(false))); tick();
    expect(paths()[0]).toBe("");
    measurements = 0;
    for (let i = 0; i < 120; i++) tick();
    expect(measurements).toBe(0);
    const oldStaticPath = paths()[1];
    staticX += 40;
    await act(() => tree.root.findAllByType("animated-view").find(node => node.props.style?.[0]?.tag === "static").props.onLayout());
    expect(paths()[1]).not.toBe(oldStaticPath);
    expect(tree.root.findAllByType("frame-view").at(-1).props.frameStyle().at(-1).opacity).toBe(0);
  } finally { if (tree) await act(() => tree.unmount()); }
  expect(frames.every(frame => !frame.active)).toBe(true);
});
