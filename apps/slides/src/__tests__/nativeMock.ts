// @ts-nocheck Shared mock: Bun caches mocked modules across test files.
import { mock } from "bun:test";

export const transitions = [];

mock.module("react-native", () => ({
  View: "view", Text: "text", PixelRatio: { get: () => 2 },
  StyleSheet: { create: (styles) => styles, absoluteFillObject: {}, absoluteFill: {} },
  Easing: { cubic: (value) => value, out: (easing) => easing },
  Animated: {
    View: "layer",
    Value: class {
      setValue() {}
      interpolate() { return 1; }
    },
    timing: () => ({ start: (done) => transitions.push(done), stop() {} }),
  },
}));
