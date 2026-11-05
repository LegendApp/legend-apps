import { expect, mock, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";

let frame: (info: { timestamp: number; timeSincePreviousFrame: number | null; timeSinceFirstFrame: number }) => void;
mock.module("react-native-reanimated", () => ({
  useFrameCallback(callback: typeof frame) { frame = callback; return { setActive() {} }; }, default: {},
}));
const { useFrameCallback } = await import("../src/renderReanimated");

test("preparation flushes do not consume the first timeline frame", async () => {
  const host = globalThis as any;
  host.IS_REACT_ACT_ENVIRONMENT = true;
  host.__slidesRenderClock = { running: false };
  const samples: number[] = [];
  function Probe() { useFrameCallback(info => samples.push(info.timestamp)); return null; }
  const tick = (timestamp: number) => frame({ timestamp, timeSincePreviousFrame: 0, timeSinceFirstFrame: 0 });
  let renderer: ReturnType<typeof create>;
  await act(() => { renderer = create(<Probe />); });
  try {
    tick(0); tick(0);
    expect(samples).toEqual([]);
    host.__slidesRenderClock.running = true;
    tick(0); tick(0); tick(1000 / 60);
    expect(samples).toEqual([0, 1000 / 60]);
    host.__slidesRenderClock.running = false;
    tick(2000 / 60);
    host.__slidesRenderClock.running = true;
    tick(2000 / 60);
    expect(samples).toEqual([0, 1000 / 60, 2000 / 60]);
  } finally { await act(() => renderer!.unmount()); delete host.__slidesRenderClock; }
});
