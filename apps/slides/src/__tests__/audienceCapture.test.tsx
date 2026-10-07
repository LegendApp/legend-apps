// @ts-nocheck Native windows and animation frames are mocked.
import { expect, mock, spyOn, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";

import { BackgroundHost, FocusSurfaceContext } from "@legend-apps/presentation";
import { transitions, transitionProgresses, idleCallbacks, flushIdleCallbacks } from "./nativeMock";
mock.module("../slidesSettings", () => ({ useBackgroundIntensitySetting: () => 1 }));
let configureMountedSurface;
function Deck(props) {
  const context = React.useContext(FocusSurfaceContext);
  React.useLayoutEffect(() => { configureMountedSurface?.(props.targetIndex, context.surface); }, [context.surface]);
  return <deck {...props} />;
}
mock.module("../DeckRenderer", () => ({ DeckRenderer: Deck, SlideCanvas: "canvas", SlideBackgroundHost: BackgroundHost }));
const { AudienceWindow } = await import("../AudienceWindow");
const { getSlidesState, setCurrentSlide, setSlidesState } = await import("../slidesStore");

test("crossfade keeps identical backgrounds fully opaque throughout forward and reverse navigation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  const opacityValue = (opacity) => typeof opacity === "number" ? opacity : opacity.__getValue();
  try {
    setSlidesState({
      currentSlide: 0,
      config: { transition: "fade" },
      slides: [0, 1, 2].map(() => ({ metadata: {}, notes: "" })),
    });
    await act(() => { renderer = create(<AudienceWindow />); });
    for (const index of [1, 2, 1, 0]) {
      await act(() => setCurrentSlide(index));
      const visible = renderer.root.findAllByType("animated-view")
        .filter((layer) => layer.props.accessibilityElementsHidden === false);
      expect(visible).toHaveLength(2);
      const outgoing = visible[0].props.style[1];
      const incoming = visible[1].props.style[1];
      expect(visible[1].findByType("deck").props.targetIndex).toBe(index);
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        transitionProgresses.at(-1).value = progress;
        const incomingAlpha = incoming.value.opacity;
        const outgoingAlpha = outgoing.value.opacity;
        // Source-over compositing must leave no contribution from the black window.
        expect(incomingAlpha + outgoingAlpha * (1 - incomingAlpha)).toBe(1);
      }
      await act(() => { transitions.splice(0).forEach((done) => done({ finished: true })); });
    }
  } finally {
    if (renderer) await act(() => renderer.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("audience retains immediate neighbors at full capture scale", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  try {
    setSlidesState({
      currentSlide: 0,
      config: { transition: "fade" },
      slides: ["none", "none", "fade", "fade", "fade", "none", "fade"].map((transition) => ({ metadata: { transition }, notes: "" })),
    });
    await act(() => { renderer = create(<AudienceWindow />); });
    for (const index of [1, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0, 1]) {
      await act(() => setCurrentSlide(index));
      await act(() => { transitions.splice(0).forEach((done) => done({ finished: true })); });
      while (idleCallbacks.size) await act(flushIdleCallbacks);
      const canvases = renderer.root.findAllByType("canvas");
      expect(canvases.map((canvas) => canvas.findByType("deck").props.targetIndex).sort((a, b) => a - b))
        .toEqual(Array.from({ length: Math.min(6, index + 1) - Math.max(0, index - 1) + 1 },
          (_, offset) => Math.max(0, index - 1) + offset));
      const active = canvases.filter((canvas) => !canvas.findByType("deck").props.isPreview && !canvas.findByType("deck").props.isOutgoing);
      expect(active).toHaveLength(1);
      expect(active[0].findByType("deck").props.targetIndex).toBe(index);
      expect(active[0].props.captureEnabled).not.toBe(false);
      for (const canvas of canvases.filter((canvas) => canvas.findByType("deck").props.isPreview)) {
        expect(canvas.props.captureEnabled).not.toBe(false);
      }
    }
    // Reverse an unfinished transition: the old outgoing slide is now current.
    for (const index of [2, 3, 2, 3, 2]) {
      await act(() => setCurrentSlide(index));
    }
    expect(log.mock.calls.some((args) => args.join(" ").includes("same key"))).toBe(false);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});


test("starting another transition never resets the opacity already attached to the visible slide", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  const incomingOpacity = () => renderer.root.findAllByType("animated-view")
    .find((layer) => layer.props.accessibilityElementsHidden !== undefined && layer.findByType("deck").props.targetIndex === getSlidesState().currentSlide)
    .props.style[1];
  try {
    setSlidesState({ currentSlide: 0, config: { transition: "fade" },
      slides: Array.from({ length: 4 }, () => ({ metadata: {}, notes: "" })) });
    await act(() => { renderer = create(<AudienceWindow />); });
    const firstOpacity = incomingOpacity();
    await act(() => setCurrentSlide(1));
    expect(firstOpacity.value.opacity).toBe(1);
    const secondOpacity = incomingOpacity();
    expect(secondOpacity).not.toBe(firstOpacity);
    transitionProgresses.at(-1).value = 0.6;
    await act(() => setCurrentSlide(2));
    expect(secondOpacity.value.opacity).toBe(0.6);
    expect(incomingOpacity()).not.toBe(secondOpacity);
    // Completion callbacks from interrupted transitions cannot settle the new one.
    const callbacks = transitions.splice(0);
    await act(() => callbacks[0]({ finished: true }));
    expect(incomingOpacity().value.opacity).toBe(0);
    await act(() => callbacks[callbacks.length - 1]({ finished: true }));
    expect(incomingOpacity().value.opacity).toBe(1);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("focus prepares live geometry before moving and reverses the destination slide's camera", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  const layers = () => tree.root.findAll((node) => node.type?.name === "AudienceFocusSurface");
  try {
    setSlidesState({ currentSlide: 0, config: {}, slides: [
      { metadata: {}, notes: "" }, { metadata: { transition: { type: "focus", from: "card", duration: 900 } }, notes: "" },
    ] });
    await act(() => { tree = create(<AudienceWindow />); });
    for (const layer of layers()) {
      const surface = layer.props.surfaces.get(layer.props.index);
      Object.assign(surface, { root: {}, width: 1920, height: 1080 });
      const rect = layer.props.index === 0 ? [400, 200, 480, 270] : [200, 100, 1000, 600];
      const view = { measureLayout: (_root, done) => done(...rect) };
      surface.entries.add({ id: "diagram", kind: "element", view });
      if (layer.props.index === 0) surface.entries.add({ id: "card", kind: "region", view });
    }
    for (const index of [1, 0]) {
      await act(() => setCurrentSlide(index));
      expect(transitions).toHaveLength(1); // Native measurements resolve during act.
      const overview = layers().find((layer) => layer.props.index === 0).props.motion;
      const detail = layers().find((layer) => layer.props.index === 1).props.motion;
      expect(overview.cameraFrom.scale).toBe(index === 1 ? 1 : 4);
      expect(overview.cameraTo.scale).toBe(index === 1 ? 4 : 1);
      expect(detail.cameraFrom.scale).toBe(1);
      expect(detail.elements.get("diagram")).toBeDefined();
      expect(transitions).toHaveLength(1);
      await act(() => transitions.splice(0).forEach((done) => done({ finished: true })));
      expect(layers().find(layer => layer.props.index === index).props.motion).toBeUndefined();
      expect(layers().find(layer => layer.props.index !== index).props.motion).toBeDefined();
    }
    // Missing target falls back to a normal fade, with no moving shared layer.
    layers()[0].props.surfaces.get(0).entries.clear();
    await act(() => setCurrentSlide(1));
    expect(layers().every((layer) => layer.props.motion === undefined)).toBe(true);
    expect(transitions).toHaveLength(1);
    // Reverse again before that animation completes; its callback must be stale.
    const stale = transitions.splice(0)[0];
    await act(() => setCurrentSlide(0));
    await act(() => stale({ finished: true }));
    expect(transitions).toHaveLength(1);
  } finally {
    if (tree) await act(() => tree.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("shared markers animate with every slide transition, backward and across jumps", async () => {
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  const layers = () => tree.root.findAll((node) => node.type?.name === "AudienceFocusSurface");
  try {
    for (const transition of [undefined, "none", "fade", "slide", { type: "focus", from: "missing" }]) {
      setSlidesState({ currentSlide: 0, config: { transition }, slides: Array.from({ length: 3 }, () => ({ metadata: {}, notes: "" })) });
      configureMountedSurface = (index, surface) => {
        Object.assign(surface, { root: {}, width: 1920, height: 1080, scale: 0.5 });
        const rect = [200 + index * 100, 100, 300, 80];
        surface.entries.add({ id: "title", kind: "element", view: { measureLayout: (_root, done) => done(...rect) } });
      };
      await act(() => { tree = create(<AudienceWindow />); });
      for (const index of [1, 0, 2]) {
        const previous = getSlidesState().currentSlide;
        await act(() => setCurrentSlide(index));
        expect(transitions).toHaveLength(1);
        const from = layers().find((layer) => layer.props.index === previous).props.motion;
        const to = layers().find((layer) => layer.props.index === index).props.motion;
        expect(from.elements.get("title").from.x).toBe(200 + previous * 100);
        expect(to.elements.get("title").to.x).toBe(200 + index * 100);
        if (transition === "slide") {
          expect(from.cameraTo.x).toBe(-180);
          expect(to.cameraFrom.x).toBe(360);
        } else {
          expect(from.cameraTo.scale).toBe(1);
          expect(to.cameraFrom.scale).toBe(1);
        }
        expect(transitions).toHaveLength(1);
        await act(() => transitions.splice(0).forEach((done) => done({ finished: true })));
        expect(layers().find(layer => layer.props.index === index).props.motion).toBeUndefined();
      }
      await act(() => tree.unmount());
      tree = undefined;
    }
  } finally {
    configureMountedSurface = undefined;
    if (tree) await act(() => tree.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("a cut with no matching destination marker settles fully visible without animation", async () => {
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ currentSlide: 0, config: {}, slides: [0, 1].map(() => ({ metadata: {}, notes: "" })) });
    await act(() => { tree = create(<AudienceWindow />); });
    const surface = tree.root.findAll((node) => node.type?.name === "AudienceFocusSurface")[0].props.surfaces.get(0);
    surface.root = {};
    surface.entries.add({ id: "unmatched", kind: "element", view: { measureLayout: (_root, done) => done(0, 0, 100, 50) } });
    await act(() => setCurrentSlide(1));
    expect(transitions).toHaveLength(0);
    const visible = tree.root.findAllByType("animated-view").filter((layer) => layer.props.accessibilityElementsHidden === false);
    expect(visible).toHaveLength(1);
    expect(visible[0].props.style[1].value.opacity).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});

test("user transitions receive progress and options, finish visibly, and recover from runtime errors", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  const calls = [];
  try {
    const definition = { duration: 650, styles(context) {
      calls.push(context);
      if (context.options.fail) throw new Error("broken transition");
      return { incoming: { opacity: context.progress }, outgoing: { opacity: 1 - context.progress } };
    } };
    setSlidesState({ currentSlide: 0, config: { transition: { name: "custom", options: { distance: 24 } } },
      transitions: { custom: definition }, slides: [0, 1, 2].map(() => ({ metadata: {}, notes: "" })) });
    await act(() => { renderer = create(<AudienceWindow />); });
    await act(() => setCurrentSlide(1));
    expect(calls.some((call) => call.progress === 0 && call.options.distance === 24 && call.direction === "forward")).toBe(true);
    await act(() => transitions.splice(0).forEach((done) => done({ finished: true })));
    expect(renderer.root.findAllByType("animated-view").filter((layer) => layer.props.accessibilityElementsHidden === false)).toHaveLength(1);
    await act(() => { setSlidesState({ config: { transition: { name: "custom", options: { fail: true } } } }); });
    await act(() => setCurrentSlide(2));
    expect(getSlidesState().runtimeErrors.some((error) => error.includes("broken transition"))).toBe(true);
    await act(() => transitions.splice(0).forEach((done) => done({ finished: true })));
    const active = renderer.root.findAllByType("deck").filter((deck) => !deck.props.isPreview && !deck.props.isOutgoing);
    expect(active).toHaveLength(1);
    expect(active[0].props.targetIndex).toBe(2);
  } finally {
    if (renderer) await act(() => renderer.unmount());
    transitions.splice(0); setSlidesState(initial); log.mockRestore();
  }
});

test("retained outgoing media keeps its live surface and final step after the crossfade completes", async () => {
  const initial = getSlidesState();
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    setSlidesState({ currentSlide: 0, currentStep: 21, config: { transition: "fade" },
      slides: [{ metadata: { steps: 22 }, notes: "" }, { metadata: { steps: 3 }, notes: "" }] });
    await act(() => { tree = create(<AudienceWindow />); });
    for (const [source, target, step] of [[0, 1, 21], [1, 0, 2]]) {
      await act(() => setSlidesState({ currentStep: step }));
      await act(() => setCurrentSlide(target));
      const outgoing = tree.root.findAllByType("deck").find(deck => deck.props.targetIndex === source);
      expect(outgoing.props.isOutgoing).toBe(true);
      expect(outgoing.props.targetStep).toBe(step);
      expect(outgoing.props.isPreview).toBe(false);
      expect(outgoing.props.isPreparing).toBe(false);
      await act(() => transitions.splice(0).forEach(done => done({ finished: true })));
      const prepared = tree.root.findAllByType("deck").find(deck => deck.props.targetIndex === source);
      expect(prepared.props.isOutgoing).toBe(true);
      expect(prepared.props.isPreview).toBe(false);
      expect(prepared.props.isPreparing).toBe(false);
      expect(prepared.props.targetStep).toBe(step);
    }
  } finally {
    if (tree) await act(() => tree.unmount());
    transitions.splice(0);
    setSlidesState(initial);
    log.mockRestore();
  }
});
