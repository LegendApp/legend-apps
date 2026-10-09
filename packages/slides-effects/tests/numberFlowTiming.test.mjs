import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const { transformSync } = createRequire(new URL("../../presentation/package.json", import.meta.url))("esbuild");

function load(file, imports = {}) {
  const module = { exports: {} };
  const code = transformSync(readFileSync(file, "utf8"), { loader: "tsx", format: "cjs" }).code;
  Function("require", "module", "exports", code)(name => imports[name], module, module.exports);
  return module.exports;
}
const state = load(new URL("../../presentation/src/playbackState.ts", import.meta.url));
const { samplePlayback } = load(new URL("../../presentation/src/playback.tsx", import.meta.url), {
  react: { createContext: () => ({}) }, "@legendapp/state/react": {}, "react-native-reanimated": {},
});
const { numberFlowTiming } = load(new URL("../packs/charts/NumberTiming.ts", import.meta.url), {
  "@legend-apps/presentation": { samplePlayback },
  "react-native-reanimated": { defineAnimation: (_, factory) => factory() },
});

function harness() {
  const input = { phase: "playing", slideKey: "music", stepKey: "step-1", stepIndex: 1 };
  const clock = { value: state.createPlaybackState(input) };
  let timestamp = 0;
  return {
    clock,
    animate(to, from, duration = 1000) {
      const animation = numberFlowTiming(clock)(to, { duration, easing: x => x });
      animation.onStart(animation, from);
      return animation;
    },
    tick(animation, ms) {
      timestamp += ms;
      clock.value = state.advancePlayback(clock.value, timestamp);
      return animation.onFrame(animation, timestamp + 99999);
    },
    transition(next) {
      clock.value = state.transitionPlayback(clock.value, { ...input, ...next });
      Object.assign(input, next);
    },
  };
}

test("number rolls, layout, and opacity follow step time rather than callback timestamps", () => {
  const h = harness();
  const animations = [h.animate(0, 2), h.animate(200, 100), h.animate(0, 1)];
  h.tick(animations[0], 0);
  h.tick(animations[0], 500);
  animations.slice(1).forEach(a => a.onFrame(a, 123456));
  assert.deepEqual(animations.map(a => a.current), [1, 150, 0.5]);
  h.tick(animations[0], 500);
  animations.slice(1).forEach(a => a.onFrame(a, 0));
  assert.deepEqual(animations.map(a => a.current), [0, 200, 0]);
});

test("outgoing and paused numbers freeze, and a previous step starts a fresh reverse roll", () => {
  const h = harness();
  const forward = h.animate(0, 2);
  h.tick(forward, 0); h.tick(forward, 500);
  for (const phase of ["paused", "outgoing"]) {
    h.transition({ phase }); h.tick(forward, 9000);
    assert.equal(forward.current, 1);
  }
  h.transition({ phase: "playing", stepKey: "step-0", stepIndex: 0 });
  assert.equal(h.tick(forward, 0), true);
  assert.equal(forward.current, 1);
  const reverse = h.animate(2, 1);
  h.tick(reverse, 0); h.tick(reverse, 500);
  assert.equal(reverse.current, 1.5);
  h.tick(reverse, 500);
  assert.equal(reverse.current, 2);
});

test("preparation samples zero, previews settle, and zero-duration timing is immediate", () => {
  const h = harness();
  h.transition({ phase: "preparing" });
  const animation = h.animate(15.4, 35.3);
  h.tick(animation, 9000);
  assert.equal(animation.current, 35.3);
  h.transition({ phase: "preview" });
  assert.equal(h.tick(animation, 9000), true);
  assert.equal(animation.current, 15.4);
  h.transition({ phase: "playing" });
  const instant = h.animate(6.3, 11.4, 0);
  assert.equal(h.tick(instant, 0), true);
  assert.equal(instant.current, 6.3);
});

test("the patched digit hook reverses an in-flight roll from the displayed digit", () => {
  const h = harness();
  const retained = [], effects = [], values = [];
  let index = 0;
  const react = {
    useState(initial) {
      const at = index++;
      retained[at] ??= typeof initial === "function" ? initial() : initial;
      return [retained[at]];
    },
    useRef(initial) {
      const at = index++;
      return retained[at] ??= { current: initial };
    },
    useCallback: fn => fn,
    useLayoutEffect: fn => effects.push(fn),
  };
  const reanimated = {
    makeMutable(initial) {
      let value = initial, animation;
      const shared = {
        get value() { return value; },
        set value(next) {
          animation = typeof next === "object" && next.onFrame ? next : undefined;
          if (animation) { animation.onStart(animation, value); value = animation.current; }
          else value = next;
        },
        tick() { if (animation) { animation.onFrame(animation, 99999); value = animation.current; } },
      };
      values.push(shared);
      return shared;
    },
    useAnimatedReaction() {}, runOnJS: fn => fn,
    withTiming() { throw new Error("NumberFlow bypassed the shared presentation clock"); },
  };
  const core = new URL("../../../apps/slides/node_modules/number-flow-react-native/src/core/", import.meta.url);
  const utils = load(new URL("utils.ts", core), { "./constants": { DIGIT_COUNT: 10 } });
  const opacity = load(new URL("useSlotOpacity.ts", core), { react, "react-native-reanimated": reanimated });
  const { useDigitAnimation } = load(new URL("useDigitAnimation.ts", core), {
    react, "react-native-reanimated": reanimated, "./constants": { DIGIT_COUNT: 10 },
    "./utils": utils, "./useSlotOpacity": opacity,
  });
  const timing = { duration: 1000, easing: x => x, animation: numberFlowTiming(h.clock) };
  const render = digitValue => {
    index = 0;
    const result = useDigitAnimation({ digitValue, entering: false, exiting: false,
      trendRef: { current: 0 }, spinTiming: timing, opacityTiming: timing });
    effects.splice(0).forEach(effect => effect());
    return result;
  };
  render(3);
  let digit = render(1);
  h.clock.value = state.advancePlayback(h.clock.value, 0);
  h.clock.value = state.advancePlayback(h.clock.value, 500);
  values.forEach(value => value.tick());
  assert.equal(digit.currentDigitSV.value - digit.animDelta.value, 2);
  h.transition({ stepKey: "step-0", stepIndex: 0 });
  digit = render(3);
  assert.equal(digit.currentDigitSV.value - digit.animDelta.value, 2);
  h.clock.value = state.advancePlayback(h.clock.value, 1000);
  h.clock.value = state.advancePlayback(h.clock.value, 2000);
  values.forEach(value => value.tick());
  assert.equal(digit.currentDigitSV.value - digit.animDelta.value, 3);
});
