// @ts-nocheck Test host views expose committed stills and the sweep's requests.
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import React, { Profiler, useContext } from "react";
import { act, create } from "react-test-renderer";

const SurfaceStillContext = React.createContext(null);
let slides = [{ steps: 2 }, { steps: 1 }];
mock.module("react-native", () => ({
  View: "view",
  Image: "image",
  StyleSheet: { create: value => value, absoluteFill: {} },
}));
mock.module("@legendapp/state/react", () => ({ useValue: read => typeof read === "function" ? read() : read.get() }));
mock.module("../slidesStore", () => ({
  getSlideStepCount: slide => slide.steps,
  slidesState$: { revision: { get: () => 1 }, slides: { get: () => slides } },
}));
mock.module("../slidesSettings", () => ({ useBackgroundIntensitySetting: () => 1 }));
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
const { PreviewStillStack, PreviewStillSweep, usePreviewStills, stillKey } = await import("../PreviewStills");

let log;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  log = spyOn(console, "error").mockImplementation(() => {});
  slides = [{ steps: 2 }, { steps: 1 }];
  surfaces = new Set([0, 1]);
  request = undefined;
  commits = 0;
});
afterEach(() => log.mockRestore());

const wait = ms => act(() => new Promise(resolve => setTimeout(resolve, ms)));

function Host({ paused = false, view, current = "0:0", next = "1:0" }) {
  const { stills, targets, sweep } = usePreviewStills(16 / 9, current, next);
  view.current = { stills, targets, add: sweep.add, generation: sweep.generation };
  return <Profiler id="preview-capture" onRender={() => commits++}><PreviewStillSweep key={sweep.generation} {...sweep} paused={paused} /></Profiler>;
}

test("holding a large deck requests two previews and makes no more commits after capture", async () => {
  slides = Array.from({ length: 100 }, () => ({ steps: 5 }));
  const view = {};
  let renderer;
  try {
    await act(() => { renderer = create(<Host view={view} />); });
    expect(view.current.targets).toHaveLength(500);
    for (const id of ["0:0", "1:0"]) {
      expect(request.id).toBe(id);
      await act(() => request.deliver(id, id));
    }
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
    const heldCommits = commits;
    await wait(450);
    expect(commits - heldCommits).toBe(0);
    await act(() => renderer.update(<Host view={view} current="1:0" next="0:0" />));
    expect(renderer.root.findAllByType("surface")).toHaveLength(0);
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

test("the sweep captures only current and next previews, then stays idle until navigation", async () => {
  const view = {};
  let renderer;
  await act(() => { renderer = create(<Host view={view} />); });
  for (const id of ["0:0", "1:0"]) {
    expect(request.id).toBe(id);
    await act(() => request.deliver(id, `uri-${id}`));
  }
  expect(view.current.stills).toEqual({ "0:0": "uri-0:0", "1:0": "uri-1:0" });
  expect(renderer.root.findAllByType("surface")).toHaveLength(0);
  await act(() => renderer.update(<Host view={view} current="0:1" />));
  expect(request.id).toBe("0:1");
  await act(() => request.deliver("0:1", "uri-0:1"));
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

test("a slide with no GPU background is skipped once, without waiting on its other steps", async () => {
  surfaces = new Set([1]);
  const view = {};
  let renderer;
  await act(() => { renderer = create(<Host view={view} />); });
  expect(request.id).toBe("0:0");
  await wait(450);
  // Slide 0 never announced a surface, so its second step is not rendered at all.
  expect(request.id).toBe("1:0");
  await act(() => request.deliver("1:0", "b"));
  expect(view.current.stills).toEqual({ "1:0": "b" });
  await act(() => renderer.unmount());
});
