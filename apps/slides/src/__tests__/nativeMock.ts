// @ts-nocheck Shared mock: Bun caches mocked modules across test files.
import { mock } from "bun:test";
import { useRef } from "react";

export const transitions = [];
export const transitionProgresses = [];
export const idleCallbacks = new Map();
let idleId = 0;
globalThis.requestIdleCallback = callback => { idleCallbacks.set(++idleId, callback); return idleId; };
globalThis.cancelIdleCallback = id => idleCallbacks.delete(id);
export function flushIdleCallbacks() {
  const callbacks = [...idleCallbacks.values()];
  idleCallbacks.clear();
  callbacks.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
}
const numeric = (value) => typeof value === "number" ? value : value.__getValue();

mock.module("react-native", () => ({
  Platform: { OS: "macos" },
  Appearance: { getColorScheme: () => "dark" },
  useColorScheme: () => "dark",
  View: "view", Text: "text", Image: "image", TextInput: "input", Pressable: "pressable", PixelRatio: { get: () => 2 },
  StyleSheet: { flatten: value => Array.isArray(value) ? Object.assign({}, ...value) : value, create: (styles) => styles, absoluteFillObject: {}, absoluteFill: {} },
  Easing: { linear: (value) => value, inOut: (easing) => easing, cubic: (value) => value, out: (easing) => easing },
  Animated: {
    View: "layer",
    subtract: (a, b) => ({ __getValue: () => numeric(a) - numeric(b) }),
    divide: (a, b) => ({ __getValue: () => numeric(a) / numeric(b) }),
    Value: class {
      constructor(value) { this.value = value; this.listeners = new Map(); this.nextId = 0; }
      setValue(value) { this.value = value; this.listeners.forEach((listener) => listener({ value })); }
      addListener(listener) { const id = String(this.nextId++); this.listeners.set(id, listener); return id; }
      removeListener(id) { this.listeners.delete(id); }
      stopAnimation() {}
      __getValue() { return this.value; }
      interpolate({ inputRange, outputRange }) {
        return { __getValue: () => {
          const next = inputRange.findIndex((value) => value > this.value);
          const i = next < 0 ? inputRange.length - 2 : Math.max(0, next - 1);
          return outputRange[i] + (this.value - inputRange[i])
            / (inputRange[i + 1] - inputRange[i]) * (outputRange[i + 1] - outputRange[i]);
        } };
      }
    },
    timing: () => ({ start: (done) => transitions.push(done), stop() {} }),
  },
}));

// PresentationProvider owns a Reanimated clock even in tests of non-animated
// consumers. Keep native runtimes out of Bun; clock tests supply their own driver.
mock.module("react-native-reanimated", () => ({
  __esModule: true,
  createWorkletRuntime: () => ({}),
  runOnRuntime: (_runtime, fn) => fn,
  default: { View: "animated-view", Text: "animated-text", createAnimatedComponent: component => component },
  useSharedValue: value => useRef({ value, set(next) { this.value = typeof next === "function" ? next(this.value) : next; } }).current,
  useDerivedValue: read => ({ _isReanimatedSharedValue: true, get value() { return read(); } }),
  useAnimatedStyle: read => ({ _isReanimatedSharedValue: true, get value() { return read(); } }),
  useAnimatedProps: read => ({ get value() { return read(); } }),
  useAnimatedRef: () => useRef(null),
  measure: () => null,
  useAnimatedReaction: () => {},
  useFrameCallback: () => ({ setActive() {} }),
  runOnUI: fn => fn,
  runOnJS: fn => fn,
  makeMutable: value => { const progress = { value }; transitionProgresses.push(progress); return progress; },
  Easing: { linear: value => value, cubic: value => value ** 3, inOut: fn => fn, out: fn => fn },
  cancelAnimation: () => {},
  defineAnimation: (_, factory) => factory(),
  withTiming: (value, _, done) => { if (done) { transitions.push(({ finished }) => done(finished)); return 0; } return value; },
}));
mock.module("@shopify/react-native-skia", () => ({
  Canvas: "canvas", Image: "image", ImageShader: "image-shader", useImage: () => null, matchFont: () => ({}),
  Blur: "blur", Group: "group", Paint: "paint", Fill: "fill", Shader: "shader", RuntimeShader: "shader",
  Skia: { RuntimeEffect: { Make: () => ({}) } },
  makeImageFromView: async () => null,
  useVideo: () => ({ currentFrame: { value: null } }),
}));
