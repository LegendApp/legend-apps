import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import { compileDeck } from "../../presentation/src/compiler";
import { createPlaybackState, advancePlayback, transitionPlayback } from "../../presentation/src/playbackState";
import { sampleTitleEntrance, titleEntranceDuration, titleEntranceEffects } from "../packs/typography/TitleEntrances";

test("every entrance begins hidden and settles without residual distortion", () => {
  const final = { x: 0, y: 0, opacity: 1, scaleX: 1, scaleY: 1, rotate: 0, rotateX: 0, reveal: 1, ghost: 0 };
  for (const effect of titleEntranceEffects) {
    for (const index of [0, 7, 16]) {
      assert.equal(sampleTitleEntrance(effect.id, 0, index, 17).opacity, 0, effect.id);
      assert.deepEqual(sampleTitleEntrance(effect.id, 4, index, 17), final, effect.id);
      for (let tick = 0; tick < 40; tick++) {
        const frame = sampleTitleEntrance(effect.id, tick / 20, index, 17);
        assert.ok(Object.values(frame).every(Number.isFinite), effect.id);
        assert.ok(frame.opacity >= 0 && frame.opacity <= 1, effect.id);
        assert.ok(frame.scaleX > 0 && frame.scaleY > 0, effect.id);
      }
    }
  }
});

test("effect completion caps preserve the final frame for all slot and line positions", () => {
  for (const { id } of titleEntranceEffects) {
    const duration = titleEntranceDuration(id);
    for (const count of [1, 2, 17, 100]) for (let index = 0; index < count; index++) {
      for (const [lineIndex, lineCount] of [[index, count], [0, 1], [1, 2]]) {
        assert.deepEqual(sampleTitleEntrance(id, duration, index, count, lineIndex, lineCount),
          sampleTitleEntrance(id, 4, index, count, lineIndex, lineCount), id);
      }
    }
    assert.ok(duration < 1.5, id);
  }
});

test("compiled title worklets serialize and obey preparation, preview, steps, exit, and replay", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "title-entrance-worklets-"));
  const previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  try {

    const deck = path.join(directory, "deck.mdx");
    fs.writeFileSync(deck, 'export { AnimatedTitle } from "slides:typography/AnimatedTitle"\n\n# Entrances');
    const compiled = await compileDeck(deck, { effectPacksDirectory: path.resolve(import.meta.dirname, "../packs") });
    if (!compiled.success) throw new Error(compiled.errors.join("\n"));
    const input = { phase: "playing" as const, slideKey: "sample", stepKey: "initial", stepIndex: 0 };
    const playback = { value: createPlaybackState(input) };
    const callbacks: any[] = [];
    const reactions: any[] = [];
    const sharedValues: any[] = [];
    let speed = 1;
    const presentation: any = { usePlayback: () => playback, usePresentationValue: () => speed,
      samplePlayback: (state: typeof playback.value, preview: number, clock: "slide" | "step") =>
        state.phase === "preparing" ? 0 : state.phase === "preview" ? preview : clock === "slide" ? state.slideTime : state.stepTime };
    const reanimated: any = { default: { View: "AnimatedView", Text: "AnimatedText" }, __esModule: true,
      useSharedValue: (value: any) => {
        const ref = React.useRef({ value });
        if (!sharedValues.includes(ref.current)) sharedValues.push(ref.current);
        return ref.current;
      },
      useAnimatedReaction: (prepare: any, react: any) => { reactions.push({ prepare, react }); },
      useDerivedValue: (fn: any) => { callbacks.push(fn); return { get value() {
        for (const reaction of reactions) restore(reaction.react)(restore(reaction.prepare)());
        return restore(fn)();
      } }; },
      useAnimatedStyle: (fn: any) => { callbacks.push(fn); return fn(); } };
    presentation.self = presentation;
    reanimated.self = reanimated;
    const module = { exports: {} as any };
    Function("require", "module", "exports", compiled.code)((name: string) => {
      if (name === "react") return React;
      if (name === "react/compiler-runtime") return require("react/compiler-runtime");
      if (name === "react/jsx-runtime") return require("react/jsx-runtime");
      if (name === "react-native") return { View: "View", Text: "Text" };
      if (name === "react-native-reanimated") return reanimated;
      if (name === "@legend-apps/presentation") return presentation;
      return {};
    }, module, module.exports);
    const { transformSync } = createRequire(new URL("../../presentation/package.json", import.meta.url))("esbuild");
    const steps = { exports: {} as any };
    const stepCode = transformSync(fs.readFileSync(fileURLToPath(new URL("../../../apps/slides/src/steps.tsx", import.meta.url)), "utf8"),
      { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
    Function("require", "module", "exports", stepCode)((name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return require("react/jsx-runtime");
      return {};
    }, steps, steps.exports);
    function restore(fn: any): any {
      if (!fn.__workletHash) return fn;
      const closure = Object.fromEntries(Object.entries(fn.__closure).map(([key, value]) => {
        assert.notEqual(value, presentation);
        assert.notEqual(value, reanimated);
        return [key, typeof value === "function" ? restore(value) : value];
      }));
      return Function(`return (${fn.__initData.code});`)().bind({ __closure: closure });
    }
    for (const effect of titleEntranceEffects) {
      callbacks.length = reactions.length = 0;
      sharedValues.length = 0;
      speed = 1;
      let renderer: ReturnType<typeof create>;
      const title = () => React.createElement(module.exports.AnimatedTitle, { effect: effect.id }, "React Native\non the desktop");
      await act(async () => { renderer = create(steps.exports.resolveSteps(title()).content); });
      assert.equal(renderer!.root.findByProps({ accessibilityRole: "header" }).props.accessibilityLabel, "React Native\non the desktop");
      for (const reaction of reactions) {
        assert.equal(typeof reaction.prepare.__workletHash, "number");
        assert.equal(typeof reaction.react.__workletHash, "number");
        restore(reaction.prepare); restore(reaction.react);
      }
      const worklets = callbacks.map(fn => {
        assert.equal(typeof fn.__workletHash, "number");
        return restore(fn);
      });
      assert.ok(worklets.length > 0, effect.id);
      playback.value = createPlaybackState(input);
      const sample = () => {
        for (const reaction of reactions) restore(reaction.react)(restore(reaction.prepare)());
        return worklets.map(fn => fn());
      };
      const initial = sample();
      playback.value = advancePlayback(advancePlayback(playback.value, 0), 550);
      const moving = sample();
      assert.notDeepEqual(moving, initial, effect.id);
      playback.value = transitionPlayback(playback.value, { ...input, stepKey: "next-step", stepIndex: 1 });
      assert.deepEqual(sample(), moving, `${effect.id}: slide entrance must not restart on a step`);
      for (const phase of ["paused", "outgoing"] as const) {
        playback.value = transitionPlayback(playback.value, { ...input, phase });
        playback.value = advancePlayback(playback.value, 10000);
        speed = 3;
        await act(async () => renderer!.update(steps.exports.resolveSteps(title()).content));
        assert.deepEqual(sample(), moving, `${effect.id}: ${phase} content freezes even when speed changes`);
      }
      speed = 0.25;
      await act(async () => renderer!.update(steps.exports.resolveSteps(title()).content));
      playback.value = transitionPlayback(playback.value, { ...input, phase: "preview" });
      const preview = sample();
      playback.value = advancePlayback(playback.value, 20000);
      assert.deepEqual(sample(), preview, `${effect.id}: preview is static`);
      assert.equal(sample()[0], 4, `${effect.id}: slow preview still shows the settled pose`);
      playback.value = transitionPlayback(playback.value, { ...input, phase: "preparing" });
      assert.deepEqual(sample(), initial, effect.id);
      playback.value = transitionPlayback(playback.value, { ...input, slideKey: "return-visit" });
      assert.deepEqual(sample(), initial, `${effect.id}: returning starts fresh`);
      playback.value = advancePlayback(advancePlayback(playback.value, 0), 500);
      assert.equal(sample()[0], 0.125, `${effect.id}: quarter speed scales shared slide time`);
      speed = 2;
      await act(async () => renderer!.update(steps.exports.resolveSteps(title()).content));
      assert.equal(sample()[0], Math.min(1, titleEntranceDuration(effect.id)), `${effect.id}: settings update reaches a mounted title`);
      playback.value = advancePlayback(playback.value, 10000);
      sample();
      const settledState = sharedValues[0].value;
      for (const timestamp of [11000, 12000, 13000]) {
        playback.value = advancePlayback(playback.value, timestamp);
        sample();
        assert.equal(sharedValues[0].value, settledState, `${effect.id}: a settled entrance must stop publishing samples`);
      }
      if (effect.id === "word-lift") {
        callbacks.length = reactions.length = 0;
        const stepTitle = React.createElement(module.exports.AnimatedTitle, { effect: effect.id, clock: "step" }, "Step title");
        await act(async () => renderer!.update(steps.exports.resolveSteps(stepTitle).content));
        const stepTime = restore(callbacks[0]);
        for (const reaction of reactions) restore(reaction.react)(restore(reaction.prepare)());
        assert.equal(stepTime(), titleEntranceDuration(effect.id));
        playback.value = transitionPlayback(playback.value, { ...input, slideKey: "return-visit", stepKey: "new-step", stepIndex: 1 });
        assert.equal(stepTime(), 0, "new step cannot expose the preceding step's sampled time before the reaction runs");
        for (const reaction of reactions) restore(reaction.react)(restore(reaction.prepare)());
        assert.equal(stepTime(), 0);
        playback.value = advancePlayback(advancePlayback(playback.value, 14000), 14250);
        for (const reaction of reactions) restore(reaction.react)(restore(reaction.prepare)());
        assert.equal(stepTime(), 0.5, "step entrance uses the same speed setting");
      }
      await act(async () => renderer!.unmount());
    }
  } finally {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: previousActEnvironment });
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test("the nine requested entrances finish within one second including their stagger", () => {
  const faster = ["word-lift", "letter-wave", "center-out", "split-arrival", "zipper", "elastic-drop", "hinge", "scatter", "stretch-release"] as const;
  for (const effect of faster) {
    assert.deepEqual(sampleTitleEntrance(effect, 1, 16, 17), sampleTitleEntrance(effect, 4, 16, 17), effect);
  }
  assert.notDeepEqual(sampleTitleEntrance("spin-in", 1, 16, 17), sampleTitleEntrance("spin-in", 4, 16, 17));
  assert.equal(sampleTitleEntrance("typewriter", 1, 16, 17).opacity, 0);
});
