// @ts-nocheck Controlled UI-thread transactions; no JS animation scheduler.
import { mock } from "bun:test";
import { useLayoutEffect, useMemo, useRef } from "react";
export const frames = [];
export const transactions = [];
const reactions = [];
export const reactUI = () => reactions.forEach(reaction => reaction.current());
mock.module("react-native-reanimated", () => ({
  __esModule: true,
  createWorkletRuntime: () => ({}),
  runOnRuntime: (_runtime, fn) => fn,
  makeMutable: value => ({value}),
  withTiming: value => value,
  runOnJS: callback => callback,
  default: { View: "animated-view" },
  useAnimatedStyle: (read) => ({ _isReanimatedSharedValue: true, get value() { return read(); } }),
  runOnUI: (callback) => (...args) => transactions.push(() => callback(...args)),
  useSharedValue: (value) => useRef({ value }).current,
  useDerivedValue: (read) => ({ _isReanimatedSharedValue: true, get value() { return read(); } }),
  useAnimatedReaction: (prepare, react) => {
    const reaction = useRef(() => {});
    reaction.current = () => react(prepare());
    useLayoutEffect(() => {
      reactions.push(reaction);
      return () => { reactions.splice(reactions.indexOf(reaction), 1); };
    }, []);
  },
  useFrameCallback: (callback) => {
    const latest = useRef(callback);
    latest.current = callback;
    return useMemo(() => {
      const frame = { active: false, setActive(value) { this.active = value; },
        tick(timestamp) { if (this.active) { latest.current({ timestamp }); reactUI(); } } };
      frames.push(frame);
      return frame;
    }, []);
  },
}));

export const flushUI = () => { while (transactions.length) transactions.shift()(); reactUI(); };
