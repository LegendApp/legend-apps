// @ts-nocheck Test host views expose committed stills and the sweep's requests.
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import React, { Profiler, useContext } from "react";
import { act, create } from "react-test-renderer";

import { PreparationBoundary, usePreparationTask } from "../../../../packages/presentation/src/PreparationBoundary";
mock.module("@legend-apps/presentation", () => ({ usePreparationTask }));
const SurfaceStillContext = React.createContext(null);
let slides = [{ steps: 2 }, { steps: 1 }];
let revision = 1, intensity = 1, speed = 1, density = 2;
let identity, reads = 0, writes = 0, cacheSequence = 0;
const disk = new Map();
const waitingReads = [];
mock.module("@legendapp/spark/files", () => ({
  getDirectory: async () => "/cache",
  readText: async file => { reads++; if (waitingReads.length) return waitingReads.shift(); if (!disk.has(file)) throw Error("missing"); return disk.get(file); },
  writeText: async (file, data) => { writes++; disk.set(file, data); },
  mkdir: async () => {},
  move: async (from, to) => { disk.set(to, disk.get(from)); disk.delete(from); },
  remove: async file => { disk.delete(file); },
}));
const cachedIdentity = () => ({ deck: (++cacheSequence).toString(16).padStart(64, "0"), content: "b".repeat(64) });
mock.module("react-native", () => ({
  View: "view", ActivityIndicator: "spinner", PixelRatio: { get: () => density },
  Image: "image", Text: "text",
  StyleSheet: { create: value => value, absoluteFill: {} },
}));
mock.module("@legendapp/state/react", () => ({ useValue: read => typeof read === "function" ? read() : read.get() }));
mock.module("../slidesStore", () => ({
  getSlideStepCount: slide => slide.steps,
  slidesState$: { revision: { get: () => revision }, slides: { get: () => slides }, previewIdentity: { get: () => identity } },
}));
mock.module("../slidesSettings", () => ({ useBackgroundIntensitySetting: () => intensity, useTitleAnimationSpeedSetting: () => speed }));
mock.module("../SlideCaptureContext", () => ({ SurfaceStillContext }));
let surfaces = new Set([0, 1]);
let request, commits;
function Surface({ slide }) {
  request = useContext(SurfaceStillContext);
  // Only slides with a GPU background answer; a live surface announces itself per request.
  React.useLayoutEffect(() => { if (surfaces.has(slide) && request.id) request.announce(); }, [request, slide]);
  return <surface slide={slide} />;
}
mock.module("../DeckRenderer", () => ({
  SlideCanvas: ({ children }) => children,
  DeckRenderer: ({ targetIndex }) => <Surface slide={targetIndex} />,
}));
const { PreviewStillStack, PreviewStillSweep, PreviewStillCapture, usePreviewStills, stillKey } = await import("../PreviewStills");

let log;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  log = spyOn(console, "error").mockImplementation(() => {});
  slides = [{ steps: 2 }, { steps: 1 }];
  revision = intensity = speed = 1; density = 2; identity = undefined; reads = writes = 0; disk.clear(); waitingReads.length = 0;
  surfaces = new Set([0, 1]);
  request = undefined;
  commits = 0;
});
afterEach(() => log.mockRestore());

const wait = ms => act(() => new Promise(resolve => setTimeout(resolve, ms)));

function Host({ paused = false, view, current = "0:0", next = "1:0", aspect = 16 / 9 }) {
  const { stills, targets, sweep } = usePreviewStills(aspect, current, next);
  view.current = { stills, targets, add: sweep.add, generation: sweep.generation, loading: sweep.loading, save: sweep.save };
  return <Profiler id="preview-capture" onRender={() => commits++}><PreviewStillSweep key={sweep.generation} {...sweep} paused={paused} /></Profiler>;
}

test("deck opening bakes every reveal once on one hidden surface, then stays idle", async () => {
  slides = Array.from({ length: 20 }, () => ({ steps: 5 }));
  surfaces = new Set(slides.map((_, index) => index));
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    expect(view.current.targets).toHaveLength(100);
    const captured = [];
    for (let i = 0; i < 100; i++) {
      expect(renderer.root.findAllByType("surface")).toHaveLength(1);
      const id = request.id;
      captured.push(id);
      await act(() => request.deliver(id, `uri-${id}`));
    }
    expect(captured.slice(0, 2)).toEqual(["0:0", "1:0"]);
    expect(new Set(captured)).toEqual(new Set(view.current.targets));
    expect(Object.keys(view.current.stills)).toHaveLength(100);
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
    const heldCommits = commits;
    await wait(450);
    expect(commits - heldCommits).toBe(0);
    await act(() => renderer.update(<Host view={view} current="15:3" next="15:4" />));
    expect(view.current.stills["15:3"]).toBe("uri-15:3");
    expect(view.current.stills["15:4"]).toBe("uri-15:4");
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
  } finally { await act(() => renderer?.unmount()); }
});

test("preparation status follows captures, pauses, and completes without further capture work", async () => {
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    expect(renderer.root.findByType("text").props.children).toBe("Preparing previews · 0/3");
    expect(renderer.root.findAllByType("spinner")).toHaveLength(1);
    await act(() => request.deliver("0:0", "first"));
    expect(renderer.root.findByType("text").props.children).toBe("Preparing previews · 1/3");
    await act(() => renderer.update(<Host view={view} paused />));
    expect(renderer.root.findByType("text").props.children).toBe("Preview preparation paused · 1/3");
    expect(renderer.root.findAllByType("spinner")).toHaveLength(0);
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
    await act(() => renderer.update(<Host view={view} />));
    await act(() => request.deliver("1:0", "second"));
    await act(() => request.deliver("0:1", "third"));
    expect(renderer.root.findByType("text").props.children).toBe("Previews ready · 3/3");
    expect(renderer.root.findAllByType("spinner")).toHaveLength(0);
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
  } finally { await act(() => renderer?.unmount()); }
});

test("a GPU capture timeout reports incomplete preparation, never ready", async () => {
  slides = [{ steps: 1 }];
  const setTimer = globalThis.setTimeout;
  const timer = spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) =>
    setTimer(callback, delay === 400 || delay === 8000 ? 1 : delay, ...args));
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    await wait(20);
    expect(renderer.root.findByType("text").props.children).toBe("Previews incomplete · 1 unavailable");
    expect(renderer.root.findAllByType("spinner")).toHaveLength(0);
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
    await act(() => view.current.add("0:0", "recovered", view.current.generation));
    expect(renderer.root.findByType("text").props.children).toBe("Previews ready · 1/1");
  } finally { timer.mockRestore(); await act(() => renderer?.unmount()); }
});

test("no preparation indicator appears before a deck is loaded", async () => {
  slides = [];
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={{}} />); });
    expect(renderer.root.findAllByType("text")).toHaveLength(0);
    expect(renderer.root.findAllByType("spinner")).toHaveLength(0);
  } finally { await act(() => renderer?.unmount()); }
});

async function bake() {
  for (const id of ["0:0", "1:0", "0:1"]) await act(() => request.deliver(id, `data:image/jpeg;base64,${btoa(id)}`));
}

test("a reopened deck restores previews without GPU capture, and note edits do no extra IO", async () => {
  identity = cachedIdentity();
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    await bake();
    expect(writes).toBe(1);
    const cached = view.current.stills, readCount = reads;
    slides = slides.map(slide => ({ ...slide, notes: "new notes" }));
    await act(() => renderer.update(<Host view={view} />));
    expect(view.current.stills).toBe(cached);
    expect(reads).toBe(readCount); expect(writes).toBe(1);
    await act(() => renderer.unmount());
    revision++;
    const metadata = slides; slides = [];
    await act(() => { renderer = create(<Host view={view} />); });
    expect(reads).toBe(readCount + 1);
    slides = metadata;
    await act(() => renderer.update(<Host view={view} />));
    expect(reads).toBe(readCount + 1);
    expect(view.current.stills).toEqual(cached);
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
    expect(renderer.root.findByType("text").props.children).toBe("Previews ready · 3/3");
    expect(writes).toBe(1);
  } finally { await act(() => renderer?.unmount()); }
});

test.each(["intensity", "aspect", "speed", "density", "content"])("a changed %s invalidates the persisted snapshot", async change => {
  identity = cachedIdentity();
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    await bake();
    if (change === "intensity") intensity = .5;
    if (change === "speed") speed = 2;
    if (change === "density") density = 1;
    if (change === "content") identity = { ...identity, content: "c".repeat(64) };
    await act(() => renderer.update(<Host view={view} aspect={change === "aspect" ? 4 / 3 : 16 / 9} />));
    expect(view.current.stills).toEqual({});
    expect(request.id).toBe("0:0");
    expect(renderer.root.findAllByType("surface")).toHaveLength(1);
  } finally { await act(() => renderer?.unmount()); }
});

test("a delayed restore cannot repopulate a newer deck generation", async () => {
  identity = cachedIdentity();
  const view = {};
  let renderer, release;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    await bake();
    const oldCache = [...disk.values()][0];
    const oldSave = view.current.save, oldGeneration = view.current.generation;
    await act(() => renderer.unmount());
    waitingReads.push(new Promise(resolve => { release = resolve; }));
    await act(() => { renderer = create(<Host view={view} />); });
    expect(view.current.loading).toBe(true);
    expect(renderer.root.findByType("text").props.children).toBe("Loading saved previews");
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
    identity = { ...identity, content: "d".repeat(64) };
    await act(() => renderer.update(<Host view={view} />));
    expect(view.current.stills).toEqual({});
    await act(() => release(oldCache));
    await act(() => oldSave(JSON.parse(oldCache), oldGeneration));
    expect(writes).toBe(1);
    expect(view.current.stills).toEqual({});
    expect(request.id).toBe("0:0");
  } finally { release?.("{}"); await act(() => renderer?.unmount()); }
});

test("restored no-GPU slide knowledge completes progress without another sweep", async () => {
  identity = cachedIdentity(); surfaces = new Set([1]);
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    await wait(450);
    await act(() => request.deliver("1:0", "data:image/jpeg;base64,AA=="));
    await act(() => renderer.unmount());
    await act(() => { renderer = create(<Host view={view} />); });
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
    expect(renderer.root.findByType("text").props.children).toBe("Previews ready · 3/3");
  } finally { await act(() => renderer?.unmount()); }
});

test("a still stack shows only its target and keeps its neighbours decoded", async () => {
  const stills = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [stillKey(i, 0), `uri-${i}`]));
  const targets = Object.keys(stills);
  let renderer;
  await act(() => { renderer = create(<PreviewStillStack stills={stills} targets={targets} target="3:0" />); });
  const images = renderer.root.findAllByType("image");
  expect(images.map(image => image.props.source.uri)).toEqual(["uri-1", "uri-2", "uri-3", "uri-4", "uri-5"]);
  expect(images.filter(image => JSON.stringify(image.props.style).includes('"opacity":0')).map(image => image.props.source.uri)).toEqual(["uri-1", "uri-2", "uri-4", "uri-5"]);
  // Moving one step keeps the same mounted images, so nothing decodes again.
  const mounted = renderer.root.findAllByType("image")[3];
  await act(() => renderer.update(<PreviewStillStack stills={stills} targets={targets} target="4:0" />));
  expect(renderer.root.findAllByType("image")[2]).toBe(mounted);
  expect(JSON.stringify(mounted.props.style)).not.toContain('"opacity":0');
  await act(() => renderer.unmount());
});

test("the sweep prioritizes current and next, then prepares the remaining reveals", async () => {
  const view = {};
  let renderer;
  await act(() => { renderer = create(<Host view={view} />); });
  for (const id of ["0:0", "1:0", "0:1"]) {
    expect(request.id).toBe(id);
    await act(() => request.deliver(id, `uri-${id}`));
  }
  expect(view.current.stills).toEqual({ "0:0": "uri-0:0", "1:0": "uri-1:0", "0:1": "uri-0:1" });
  expect(renderer.root.findAllByType("surface")).toHaveLength(0);
  await act(() => renderer.update(<Host view={view} current="0:1" />));
  expect(view.current.stills["0:1"]).toBe("uri-0:1");
  expect(renderer.root.findAllByType("surface")).toHaveLength(0);
  await act(() => renderer.unmount());
});

test("paused, the sweep holds its place and asks for nothing until navigation settles", async () => {
  const view = {};
  let renderer;
  await act(() => { renderer = create(<Host view={view} />); });
  await act(() => request.deliver("0:0", "a"));
  const inFlight = request;
  await act(() => renderer.update(<Host view={view} paused />));
  expect(renderer.root.findAllByType("surface")).toHaveLength(0);
  await act(() => inFlight.deliver("1:0", "late"));
  expect(view.current.stills).toEqual({ "0:0": "a" });
  await wait(450);
  await act(() => renderer.update(<Host view={view} />));
  expect(request.id).toBe("1:0");
  await act(() => renderer.unmount());
});

test("an answer for a step the sweep has moved past is ignored", async () => {
  const view = {};
  let renderer;
  await act(() => { renderer = create(<Host view={view} />); });
  await act(() => request.deliver("0:0", "a"));
  await act(() => request.deliver("0:0", "late"));
  expect(view.current.stills).toEqual({ "0:0": "a" });
  expect(request.id).toBe("1:0");
  await act(() => renderer.unmount());
});

test("stills survive the deck changing shape, and the old deck's are dropped", async () => {
  slides = [{ steps: 1 }];
  const view = {};
  let renderer;
  await act(() => { renderer = create(<Host view={view} />); });
  const oldGeneration = view.current.generation;
  await act(() => request.deliver("0:0", "old"));
  slides = [{ steps: 1 }, { steps: 1 }];
  await act(() => renderer.update(<Host view={view} />));
  expect(view.current.stills).toEqual({});
  expect(request.id).toBe("0:0");
  const stale = view.current.add;
  await act(() => request.deliver("0:0", "new"));
  expect(view.current.stills).toEqual({ "0:0": "new" });
  // An answer still in flight from the replaced deck's sweep must not wipe the new deck's stills.
  await act(() => stale("1:0", "old", oldGeneration));
  expect(view.current.stills).toEqual({ "0:0": "new" });
  await act(() => renderer.unmount());
});

test.each(["revision", "intensity", "aspect"])("a changed %s restarts baking and rejects the previous generation", async change => {
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    await act(() => request.deliver("0:0", "old"));
    const old = request;
    if (change === "revision") revision++;
    if (change === "intensity") intensity = .5;
    await act(() => renderer.update(<Host view={view} aspect={change === "aspect" ? 4 / 3 : 16 / 9} />));
    expect(view.current.stills).toEqual({});
    expect(request.id).toBe("0:0");
    await act(() => old.deliver("1:0", "obsolete"));
    expect(view.current.stills).toEqual({});
    await act(() => request.deliver("0:0", "new"));
    expect(view.current.stills).toEqual({ "0:0": "new" });
  } finally { await act(() => renderer?.unmount()); }
});

test("a slide with no GPU background is skipped once, without waiting on its other steps", async () => {
  surfaces = new Set([1]);
  const view = {};
  let renderer;
  await act(() => { renderer = create(<Host view={view} />); });
  expect(request.id).toBe("0:0");
  await wait(450);
  // Slide 0 never announced a surface, so its second step is not rendered at all.
  expect(request.id).toBe("1:0");
  expect(renderer.root.findByType("text").props.children).toBe("Preparing previews · 2/3");
  await act(() => request.deliver("1:0", "b"));
  expect(view.current.stills).toEqual({ "1:0": "b" });
  expect(renderer.root.findByType("text").props.children).toBe("Previews ready · 3/3");
  await act(() => renderer.unmount());
});

function LiveHost({ view, current = "0:0", next = "1:0", paused = false }) {
  const state = usePreviewStills(16 / 9, current, next);
  view.current = { ...state, add: state.sweep.add, generation: state.sweep.generation };
  return <PreviewStillCapture target={current} generation={state.sweep.generation} add={state.sweep.add} paused={paused || !!state.stills[current]}><Surface slide={Number(current.split(":")[0])}/></PreviewStillCapture>;
}
test("settled live previews capture their existing surface and reject a retired target", async () => {
  expect(typeof PreviewStillCapture).toBe("function");
  const view = {}; let renderer;
  try {
    await act(() => { renderer = create(<LiveHost view={view} paused/>); });
    expect(renderer.root.findAllByType("surface")).toHaveLength(1);
    expect(request.id).toBeUndefined();
    await act(() => renderer.update(<LiveHost view={view}/>));
    const old = request;
    expect(old.id).toBe("0:0");
    await act(() => renderer.update(<LiveHost view={view} current="1:0" next="0:0"/>));
    await act(() => old.deliver("0:0", "obsolete"));
    expect(view.current.stills).toEqual({});
    await act(() => request.deliver("1:0", "live"));
    expect(view.current.stills).toEqual({"1:0":"live"});
    expect(request.id).toBeUndefined();
    expect(renderer.root.findAllByType("surface")).toHaveLength(1);
  } finally { await act(() => renderer?.unmount()); }
});
test("a cached preview waits for its own image to decode, rejects late loads, and reports failed images", async () => {
  let ready = 0, renderer;
  const targets = ["0:0", "1:0"];
  const content = uri => <PreparationBoundary onReady={() => ready++}><PreviewStillStack target="0:0" targets={targets} stills={{"0:0":uri,"1:0":"neighbor"}}/></PreparationBoundary>;
  try {
    await act(() => { renderer = create(content("first")); });
    expect(ready).toBe(0);
    const stale = renderer.root.findAllByType("image")[0].props.onLoad;
    await act(() => renderer.root.findAllByType("image")[1].props.onLoad());
    expect(ready).toBe(0);
    await act(() => renderer.update(content("second")));
    await act(() => stale());
    expect(ready).toBe(0);
    await act(() => renderer.root.findAllByType("image")[0].props.onLoad());
    expect(ready).toBe(1);
    await act(() => renderer.update(content("broken")));
    const beforeError = ready;
    await act(() => renderer.root.findAllByType("image")[0].props.onError());
    expect(ready).toBe(beforeError+1);
    expect(renderer.root.findByType("text").props.children).toBe("Preview unavailable");
  } finally { await act(() => renderer?.unmount()); }
});
