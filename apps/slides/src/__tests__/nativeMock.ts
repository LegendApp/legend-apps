// @ts-nocheck Shared mock: Bun caches mocked modules across test files.
import { mock } from "bun:test";

export const transitions = [];
const numeric = (value) => typeof value === "number" ? value : value.__getValue();

mock.module("react-native", () => ({
  View: "view", Text: "text", PixelRatio: { get: () => 2 },
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
        return { __getValue: () => outputRange[0] + (this.value - inputRange[0])
          / (inputRange[1] - inputRange[0]) * (outputRange[1] - outputRange[0]) };
      }
    },
    timing: () => ({ start: (done) => transitions.push(done), stop() {} }),
  },
}));
