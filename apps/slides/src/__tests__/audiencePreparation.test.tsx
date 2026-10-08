// @ts-nocheck Native windows, clocks, and the idle scheduler are mocked.
import { expect, mock, spyOn, test } from "bun:test";
import React, { useContext, useEffect } from "react";
import { act, create } from "react-test-renderer";
import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { BackgroundHost, NavigationTransitionContext, usePreparationTask } from "@legend-apps/presentation";
import { transitions } from "./nativeMock";
const pending$ = observable({ index: -1, waiting: false });
const mounts: number[] = [], unmounts: number[] = [];
const renders = new Map<number, number>();
function Deck(props) {
  usePreparationTask(useValue(() => pending$.index.get() === props.targetIndex && pending$.waiting.get()));
  renders.set(props.targetIndex, (renders.get(props.targetIndex) ?? 0) + 1);
  useEffect(() => { mounts.push(props.targetIndex); return () => { unmounts.push(props.targetIndex); }; }, []);
  return <deck {...props} navigation={useContext(NavigationTransitionContext)} />;
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
  renders.clear();
  const indexes = () => renderer.root.findAllByType("deck").map(view => view.props.targetIndex).sort((a,b) => a-b);
  const finish = () => act(() => { transitions.splice(0).forEach(done => done({ finished: true })); });
  const idle = () => act(() => { const [id, callback] = jobs.entries().next().value; jobs.delete(id); callback({ didTimeout: false, timeRemaining: () => 50 }); });
  const drain = async () => { for (let i=0;jobs.size;i++) { if (i>20) throw Error("Preparation did not converge"); await idle(); } };
  try {
    setSlidesState({ currentSlide: 9, currentStep: 0, config: { transition: "fade" }, slides: Array.from({length:20},()=>({metadata:{steps:4},notes:""})) });
    await act(() => { renderer = create(<AudienceWindow />); });
    await run({ indexes, finish, idle, drain, jobs, decks: () => renderer.root.findAllByType("deck"),
      unmount: () => act(() => renderer.unmount()) });
  } finally {
    if (renderer) await act(() => renderer.unmount());
    transitions.splice(0);
    pending$.assign({ index: -1, waiting: false });
    setSlidesState(initial);
    globalThis.requestIdleCallback = originalRequest;
    globalThis.cancelIdleCallback = originalCancel;
    log.mockRestore();
  }
}

test("completion adds no neighbors; idle preparation mounts one nearest neighbor per commit", () => harness(async h => {
  expect(h.indexes()).toEqual([8,9,10]);
  await act(() => setCurrentSlide(7));
  await h.finish();
  expect(h.indexes()).toEqual([7,8]);
  expect(mounts).toEqual([8,10,9,7]);
  await h.idle();
  expect(h.indexes()).toEqual([6,7,8]);
  expect(mounts.at(-1)).toBe(6);
  expect(h.jobs.size).toBe(0);
}));

test("completion freezes the retained outgoing tree without rebuilding either deck", () => harness(async h => {
  await act(() => setSlidesState({ currentStep: 3 }));
  await act(() => setCurrentSlide(8));
  const before = [...renders];
  const source = h.decks().find(deck => deck.props.targetIndex === 9);
  expect(source.props).toMatchObject({ isOutgoing: true, isPreparing: false, isPreview: false, targetStep: 3 });
  const navigation = source.props.navigation;
  await h.finish();
  expect([...renders]).toEqual(before);
  const retained = h.decks().find(deck => deck.props.targetIndex === 9);
  expect(retained.props.navigation).toBe(navigation);
  expect(retained.props).toMatchObject({ isOutgoing: true, isPreparing: false, isPreview: false, targetStep: 3 });
  await act(() => setCurrentSlide(9));
  const returning = h.decks().find(deck => deck.props.targetIndex === 9);
  expect(returning.props).toMatchObject({ isOutgoing: false, isPreparing: false, isPreview: false });
  expect(returning.props.targetStep).toBeUndefined();
  expect(returning.props.navigation).not.toBe(navigation);
}));

test("navigation leaves unrelated prepared deck content and context untouched", () => harness(async h => {
  const prepared = h.decks().find(deck => deck.props.targetIndex === 10);
  const before = renders.get(10);
  await act(() => setCurrentSlide(8));
  expect(renders.get(10)).toBe(before);
  expect(h.decks().find(deck => deck.props.targetIndex === 10).props.navigation).toBe(prepared.props.navigation);
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
  expect(h.indexes()).toEqual([6,7,8]);
  expect(mounts.filter(index=>index===6)).toHaveLength(before);
}));

test("rapid interrupted jumps retain a bounded neighborhood plus the two visible slides", () => harness(async h => {
  for (const index of [17,2,14,1,18]) {
    await act(() => setCurrentSlide(index));
    expect(h.indexes().length).toBeLessThanOrEqual(5);
    expect(h.indexes()).toContain(index);
    expect(h.jobs.size).toBe(0);
  }
  await h.finish(); await h.drain();
  expect(h.indexes()).toEqual([17,18,19]);
}));

test("far jumps skip intermediate slides and cuts, revisions, and unmount cancel pending preparation", () => harness(async h => {
  await act(() => setCurrentSlide(17)); await h.finish();
  expect(h.indexes()).toEqual([17]);
  await h.drain();
  expect(h.indexes()).toEqual([16,17,18]);
  expect(mounts.some(index=>index>=12 && index<=14)).toBe(false);
  await act(() => setSlidesState({config:{transition:"none"},currentSlide:2}));
  expect(h.indexes()).toEqual([2]);
  const stale = h.jobs.values().next().value;
  await act(() => setSlidesState({revision:getSlidesState().revision+1,currentSlide:3}));
  await act(() => stale());
  await h.drain();
  expect(h.indexes()).toEqual([2,3,4]);
  await act(() => setCurrentSlide(10));
  expect(h.jobs.size).toBe(1);
  const cancelled = h.jobs.values().next().value;
  await h.unmount();
  expect(h.jobs.size).toBe(0);
  const count=mounts.length;
  await act(() => cancelled());
  expect(mounts).toHaveLength(count);
}));


test("incoming readiness holds the transition clock and playback until preparation completes", () => harness(async h => {
  await act(() => pending$.assign({ index: 7, waiting: true }));
  await act(() => setCurrentSlide(7));
  expect(transitions).toHaveLength(0);
  expect(h.decks().find(deck => deck.props.targetIndex === 7).props.isPreparing).toBe(true);
  expect(h.decks().find(deck => deck.props.targetIndex === 9).props.isOutgoing).toBe(true);
  await act(() => pending$.waiting.set(false));
  expect(transitions).toHaveLength(1);
  expect(h.decks().find(deck => deck.props.targetIndex === 7).props.isPreparing).toBe(false);
  await h.finish();
  expect(h.indexes()).toEqual([7,8]);
}));

test("a superseded pending slide cannot start the replacement transition", () => harness(async h => {
  await act(() => pending$.assign({ index: 7, waiting: true }));
  await act(() => setCurrentSlide(7));
  expect(transitions).toHaveLength(0);
  await act(() => setCurrentSlide(6));
  expect(transitions).toHaveLength(1);
  await act(() => pending$.waiting.set(false));
  expect(transitions).toHaveLength(1);
  expect(h.decks().find(deck => deck.props.targetIndex === 6).props.isPreparing).toBe(false);
  await h.finish();
}));
