// @ts-nocheck Shared mock: Bun caches mocked modules across test files.
import { mock } from "bun:test";

export const transitions = [];
const numeric = (value) => typeof value === "number" ? value : value.__getValue();

mock.module("react-native", () => ({
  View: "view", Text: "text", Pressable: "pressable", PixelRatio: { get: () => 2 },
  StyleSheet: { create: (styles) => styles, absoluteFillObject: {}, absoluteFill: {} },
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
