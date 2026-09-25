// @ts-nocheck Controlled UI and metadata runtimes exercise native resource ownership.
import { expect, mock, test } from "bun:test";
import React, { useMemo, useRef } from "react";
import { act, create } from "react-test-renderer";
mock.module("react-native", () => ({ Platform: { OS: "macos" } }));
const loads = [], frames = [], players = [];
function player() {
  const image = {};
  const result = { polls: 0, disposed: 0, available: false, playing: false,
    nextImage() { this.polls++; return this.available ? image : null; },
    currentTime: () => 12, duration: () => 100, framerate: () => 60,
    rotation: () => 0, size: () => ({ width: 100, height: 100 }),
    setLooping() {}, setVolume() {}, play() { this.playing = true; }, pause() { this.playing = false; },
    dispose() { this.disposed++; } };
  players.push(result); return result;
}
mock.module("@shopify/react-native-skia", () => ({ Skia: { Video: player }, useVideo: () => {} }));
mock.module("react-native-reanimated", () => ({
  useDerivedValue: fn => ({ get value() { return fn(); } }),
  createWorkletRuntime: () => ({}), runOnJS: fn => fn, runOnUI: fn => fn,
  runOnRuntime: (_, fn) => (...args) => loads.push(() => fn(...args)),
  useSharedValue: value => useRef({ value }).current,
  useFrameCallback: callback => {
    const latest = useRef(callback); latest.current = callback;
    return useMemo(() => {
      const frame = { active: false, setActive(value) { this.active = value; }, tick() { if (this.active) latest.current(); } };
      frames.push(frame); return frame;
    }, []);
  },
}));
const { useNativeVideo } = await import("../../../../packages/presentation/src/useNativeVideo");
test("paused video acquires one frame, stops polling, resumes without replacing it and disposes on source change", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let value, tree;
  function Probe({ source, playing }) { value = useNativeVideo(source, playing); return null; }
  await act(() => { tree = create(<Probe source="one" playing={false} />); });
  await act(() => loads.shift()());
  const native = players.at(-1), frame = frames.at(-1);
  await act(() => frame.tick());
  expect(native.polls).toBe(1); expect(frame.active).toBe(true);
  native.available = true;
  await act(() => frame.tick());
  const held = value.currentFrame.value;
  expect(frame.active).toBe(false);
  for (let i=0;i<120;i++) frame.tick();
  expect(native.polls).toBe(2);
  await act(() => tree.update(<Probe source="one" playing />));
  expect(value.currentFrame.value).toBe(held);
  await act(() => frame.tick());
  expect(native.polls).toBe(3); expect(native.playing).toBe(true);
  await act(() => tree.update(<Probe source="one" playing={false} />));
  expect(frame.active).toBe(false); expect(value.currentFrame.value).toBe(held);
  await act(() => tree.update(<Probe source="two" playing={false} />));
  expect(native.disposed).toBe(1); expect(value.currentFrame.value).toBe(null);
  await act(() => tree.unmount());
  await act(() => loads.shift()());
  expect(players.at(-1).disposed).toBe(1);
});
