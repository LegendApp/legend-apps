// @ts-nocheck Native windows, clocks, and the idle scheduler are mocked.
import { expect, mock, spyOn, test } from "bun:test";
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { BackgroundHost } from "@legend-apps/presentation";
import { transitions } from "./nativeMock";
const mounts: number[] = [], unmounts: number[] = [];
function Deck(props) {
  useEffect(() => { mounts.push(props.targetIndex); return () => { unmounts.push(props.targetIndex); }; }, []);
  return <deck {...props} />;
}
mock.module("../slidesSettings", () => ({ useBackgroundIntensitySetting: () => 1 }));
mock.module("../DeckRenderer", () => ({ DeckRenderer: Deck, SlideCanvas: "canvas", SlideBackgroundHost: BackgroundHost }));
const { AudienceWindow } = await import("../AudienceWindow");
const { getSlidesState, setCurrentSlide, setSlidesState } = await import("../slidesStore");

async function harness(run) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const originalRequest = globalThis.requestIdleCallback, originalCancel = globalThis.cancelIdleCallback;
  const jobs = new Map();
  let next = 0;
  globalThis.requestIdleCallback = callback => { jobs.set(++next, callback); return next; };
  globalThis.cancelIdleCallback = id => jobs.delete(id);
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  mounts.length = unmounts.length = 0;
  const indexes = () => renderer.root.findAllByType("deck").map(view => view.props.targetIndex).sort((a,b) => a-b);
  const finish = () => act(() => { transitions.splice(0).forEach(done => done({ finished: true })); });
  const idle = () => act(() => { const [id, callback] = jobs.entries().next().value; jobs.delete(id); callback({ didTimeout: false, timeRemaining: () => 50 }); });
  const drain = async () => { for (let i=0;jobs.size;i++) { if (i>20) throw Error("Preparation did not converge"); await idle(); } };
  try {
    setSlidesState({ currentSlide: 9, currentStep: 0, config: { transition: "fade" }, slides: Array.from({length:20},()=>({metadata:{},notes:""})) });
    await act(() => { renderer = create(<AudienceWindow />); });
    await run({ indexes, finish, idle, drain, jobs, unmount: () => act(() => renderer.unmount()) });
  } finally {
    if (renderer) await act(() => renderer.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    globalThis.requestIdleCallback = originalRequest;
    globalThis.cancelIdleCallback = originalCancel;
    log.mockRestore();
  }
}

test("completion adds no neighbors; idle preparation mounts one nearest neighbor per commit", () => harness(async h => {
  expect(h.indexes()).toEqual([7,8,9,10,11]);
  await act(() => setCurrentSlide(7));
  await h.finish();
  expect(h.indexes()).toEqual([7,8,9]);
  expect(mounts).toEqual([7,8,10,11,9]);
  await h.idle();
  expect(h.indexes()).toEqual([6,7,8,9]);
  expect(mounts.at(-1)).toBe(6);
  await h.idle();
  expect(h.indexes()).toEqual([5,6,7,8,9]);
  expect(mounts.at(-1)).toBe(5);
  expect(h.jobs.size).toBe(0);
}));

test("interruption and reversal discard stale idle work and preserve promoted instances", () => harness(async h => {
  await act(() => setCurrentSlide(7)); await h.finish();
  const stale = h.jobs.values().next().value;
  await h.idle();
  const before = mounts.filter(index=>index===6).length;
  await act(() => setCurrentSlide(6));
  expect(h.jobs.size).toBe(0);
  await act(() => stale());
  expect(h.indexes()).not.toContain(5);
  expect(mounts.filter(index=>index===6)).toHaveLength(before);
  await act(() => setCurrentSlide(7)); await h.finish(); await h.drain();
  expect(h.indexes()).toEqual([5,6,7,8,9]);
  expect(mounts.filter(index=>index===6)).toHaveLength(before);
}));

test("rapid interrupted jumps retain a bounded neighborhood plus the two visible slides", () => harness(async h => {
  for (const index of [17,2,14,1,18]) {
    await act(() => setCurrentSlide(index));
    expect(h.indexes().length).toBeLessThanOrEqual(7);
    expect(h.indexes()).toContain(index);
    expect(h.jobs.size).toBe(0);
  }
  await h.finish(); await h.drain();
  expect(h.indexes()).toEqual([16,17,18,19]);
}));

test("far jumps skip intermediate slides and cuts, revisions, and unmount cancel pending preparation", () => harness(async h => {
  await act(() => setCurrentSlide(17)); await h.finish();
  expect(h.indexes()).toEqual([17]);
  await h.drain();
  expect(h.indexes()).toEqual([15,16,17,18,19]);
  expect(mounts.some(index=>index>=12 && index<=14)).toBe(false);
  await act(() => setSlidesState({config:{transition:"none"},currentSlide:2}));
  expect(h.indexes()).toEqual([2]);
  const stale = h.jobs.values().next().value;
  await act(() => setSlidesState({revision:getSlidesState().revision+1,currentSlide:3}));
  await act(() => stale());
  await h.drain();
  expect(h.indexes()).toEqual([1,2,3,4,5]);
  await act(() => setCurrentSlide(10));
  expect(h.jobs.size).toBe(1);
  const cancelled = h.jobs.values().next().value;
  await h.unmount();
  expect(h.jobs.size).toBe(0);
  const count=mounts.length;
  await act(() => cancelled());
  expect(mounts).toHaveLength(count);
}));
