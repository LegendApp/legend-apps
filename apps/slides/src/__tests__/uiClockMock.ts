// @ts-nocheck Controlled UI-thread transactions; no JS animation scheduler.
import { mock } from "bun:test";
import React, { useLayoutEffect, useMemo, useRef } from "react";
export const frames = [];
export const transactions = [];
const reactions = [];
export const reactUI = () => reactions.forEach(reaction => reaction.current());
function assertOutsideRender() {
  if (React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?.A?.getOwner?.()) {
    throw new Error("Shared values must not be read during React render");
  }
}
function sharedValue(initial) {
  let value = initial;
  return {
    get value() {
      assertOutsideRender();
      return value;
    },
    set value(next) { value = next; },
    get() { return this.value; },
    set(next) { this.value = typeof next === "function" ? next(this.value) : next; },
  };
}
const native = { ...await import("react-native-reanimated") };
const clockMock = {
  ...native,
  __esModule: true,
  createWorkletRuntime: () => ({}),
  runOnRuntime: (_runtime, fn) => fn,
  makeMutable: value => ({value}),
  withTiming: value => value,
  runOnJS: callback => callback,
  default: { View: "animated-view" },
  useAnimatedStyle: (read) => ({ _isReanimatedSharedValue: true, get value() { return read(); } }),
  runOnUI: (callback) => (...args) => transactions.push(() => callback(...args)),
  useSharedValue: (value) => useRef(sharedValue(value)).current,
  useDerivedValue: (read) => ({ _isReanimatedSharedValue: true, get value() { assertOutsideRender(); return read(); }, get() { return this.value; } }),
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
};
mock.module("react-native-reanimated", () => clockMock);
mock.module("../../../../packages/presentation/node_modules/react-native-reanimated", () => clockMock);

export const flushUI = () => { while (transactions.length) transactions.shift()(); reactUI(); };
