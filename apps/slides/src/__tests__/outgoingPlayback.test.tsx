// @ts-nocheck Native leaves are mocked; audience retention and playback are real.
import "./nativeMock";
import { expect, mock, test } from "bun:test";
import React from "react";
import * as state from "@legendapp/state";
import * as stateReact from "@legendapp/state/react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import { act, create } from "react-test-renderer";
import { transitions, flushIdleCallbacks } from "./nativeMock";
import { getSlidesState, setCurrentSlide, setSlidesState } from "../slidesStore";

const frames = [];
const animated = { ...await import("react-native-reanimated") };
const clockMock = { ...animated,
  useFrameCallback(callback) {
    const latest = React.useRef(callback); latest.current = callback;
    return React.useMemo(() => {
      const frame = { active: false, setActive(active) { this.active = active; }, tick(timestamp) { if (this.active) latest.current({ timestamp }); } };
      frames.push(frame); return frame;
    }, []);
  },
};
mock.module("react-native-reanimated", () => clockMock);
mock.module("../../../../packages/presentation/node_modules/react-native-reanimated", () => clockMock);
const skia = { ...await import("@shopify/react-native-skia") };
mock.module("../../../../packages/presentation/node_modules/@shopify/react-native-skia", () => skia);
const { PresentationProvider, usePlayback, usePresentation, samplePlayback, usePreparationTask } = await import("@legend-apps/presentation");
const native = { ...await import("react-native"), Linking: {} };
mock.module("react-native", () => native);
mock.module("../slidesSettings", () => ({ useBackgroundIntensitySetting: () => 1, titleAnimationSpeedSetting: { get: () => 1 } }));
const filename = fileURLToPath(new URL("../DeckRenderer.tsx", import.meta.url));
const require = createRequire(filename);
const { code } = transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [require.resolve("@react-native/babel-preset")],
  plugins: [[require.resolve("babel-plugin-react-compiler"), { target: "19" }]],
});
const module = { exports: {} };
const leaves = {
  "react-native": native, "@legendapp/state": state, "@legendapp/state/react": stateReact,
  uniwind: { useResolveClassNames: () => ({}) },
  "@legend-apps/scaled-view": { ScaledView: "scaled-view" },
  "./slidesSettings": { useBackgroundIntensitySetting: () => 1, titleAnimationSpeedSetting: { get: () => 1 } },
  "./Layout": { Layout: "layout", LayoutStage: "layout-stage" },
  "./CodeBlock": { CodeBlock: "code" }, "./LiquidGlass": { LiquidGlass: "glass" },
  "./Effect": { Effect: "effect" }, "./TypeGPU": { TypeGPU: "gpu" },
  "./TypeGPUShader": { TypeGPUShader: "shader" }, "./Webview": { Webview: "webview" },
};
new Function("require", "module", "exports", code)(name => leaves[name] ?? require(name), module, module.exports);
const { DeckRenderer } = module.exports;
mock.module("../DeckRenderer", () => module.exports);
const { AudienceWindow } = await import("../AudienceWindow");

const pending$ = state.observable({ index: -1, waiting: false });
function Motion() {
  const runtime = usePresentation();
  usePreparationTask(stateReact.useValue(() => pending$.index.get() === runtime.slideIndex && pending$.waiting.get()));
  return <motion runtime={runtime} playback={usePlayback()} />;
}
function Document({ components: { Deck, Slide } }) {
  return <Deck configJson='{"transition":"fade"}'>{[0, 1, 2].map(index =>
    <Slide key={index} metadataJson='{"steps":3}' notes=""><Motion /></Slide>)}</Deck>;
}

test("outgoing slide and step effects keep their phase until focus, then retire through back and interrupted navigation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  let tree, preview;
  const tick = timestamp => act(() => frames.forEach(frame => frame.tick(timestamp)));
  const motions = () => tree.root.findAllByType("motion");
  const at = index => motions().find(node => node.props.runtime.slideIndex === index);
  const time = index => samplePlayback(at(index).props.playback.value, 4, "step");
  const finish = () => act(() => transitions.splice(0).forEach(done => done({ finished: true })));
  try {
    setSlidesState({ component: Document, currentSlide: 0, currentStep: 0, slides: Array.from({ length: 3 }, () => ({ metadata: { steps: 3 }, notes: "" })), config: { transition: "fade" }, audienceOpen: true });
    await act(() => { tree = create(<AudienceWindow />); preview = create(<DeckRenderer isPreview targetIndex={2} />); });
    await tick(1000); await tick(2000);
    await act(() => setSlidesState({ currentStep: 1 }));
    await tick(2500); await tick(3000);
    const before = at(0).props.playback.value;
    expect(time(0)).toBe(0.5);
    await act(() => setCurrentSlide(1));
    const outgoing = at(0).props.playback.value;
    expect(outgoing.slideKey).toBe(before.slideKey);
    expect(outgoing.stepKey).toBe(before.stepKey);
    expect(at(0).props.runtime.isActive).toBe(true);
    await tick(3500);
    expect(time(0)).toBe(1);
    expect(at(0).props.playback.value.slideTime).toBe(before.slideTime + 0.5);
    expect(preview.root.findByType("motion").props.playback.value.slideTime).toBe(0);
    await finish();
    await tick(4000);
    expect(at(0).props.runtime.isActive).toBe(false);
    expect(time(0)).toBe(0);
    await act(() => flushIdleCallbacks());
    expect(at(2).props.runtime).toMatchObject({ isPreparing: true, isActive: false });
    expect(time(2)).toBe(0);

    // Backward departure keeps the old lifetime, while the returning slide starts anew.
    const one = at(1).props.playback.value;
    await act(() => setCurrentSlide(0));
    await tick(4500);
    expect(at(1).props.playback.value.slideTime).toBe(one.slideTime + 0.5);
    expect(time(0)).toBe(0);
    const stale = transitions.splice(0);
    await act(() => setCurrentSlide(2));
    await act(() => stale.forEach(done => done({ finished: true })));
    await tick(5000);
    expect(at(0).props.runtime.isActive).toBe(true);
    expect(at(1).props.runtime.isActive).toBe(false);
    await finish();
    expect(motions().filter(node => node.props.runtime.isActive).map(node => node.props.runtime.slideIndex)).toEqual([2]);

    // A previously visited neighbor that never finishes preparation has no outgoing lifetime to revive.
    await act(() => pending$.assign({ index: 1, waiting: true }));
    await act(() => setCurrentSlide(1));
    expect(at(1).props.runtime).toMatchObject({ isPreparing: true, isActive: false });
    await act(() => setCurrentSlide(0));
    await tick(5500);
    expect(at(1).props.runtime.isActive).toBe(false);
    await finish();
  } finally {
    await act(() => { tree?.unmount(); preview?.unmount(); });
    transitions.splice(0);
    pending$.assign({ index: -1, waiting: false });
    setSlidesState(initial);
  }
});

test("an explicit playback pause still excludes paused time", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const runtime$ = state.observable({ slideIndex: 0, stepIndex: 0, isActive: true, playbackPhase: "playing" });
  let tree;
  const clock = () => tree.root.findByType("motion").props.playback.value;
  const tick = timestamp => act(() => frames.forEach(frame => frame.tick(timestamp)));
  try {
    await act(() => { tree = create(<PresentationProvider value={runtime$}><Motion /></PresentationProvider>); });
    await tick(1000); await tick(2000);
    await act(() => runtime$.assign({ isActive: false, playbackPhase: "paused" }));
    await tick(10000);
    expect(clock().stepTime).toBe(1);
    await act(() => runtime$.assign({ isActive: true, playbackPhase: "playing" }));
    await tick(20000); await tick(20500);
    expect(clock().stepTime).toBe(1.5);
  } finally { await act(() => tree?.unmount()); }
});
