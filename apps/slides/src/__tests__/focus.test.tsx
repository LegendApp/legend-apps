// @ts-nocheck Native measurement is supplied by the test host.
import { expect, test } from "bun:test";
import React, { useState } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
import { Animated } from "react-native";
import { FocusRegion, SharedElement, FocusStage, FocusSurfaceContext, createFocusSurface,
  measureFocusSurface, measureFocusPair, prepareFocusSurface, invalidateFocusSurface, createFocusMotion } from "../../../../packages/presentation/src/focus";
import { focusCamera, normalizeTransition, resolveTransition } from "../../../../packages/presentation/src/focusGeometry";

test("focus configuration follows its edge backward, skips jumps, and respects explicit cuts", () => {
  const focus = { type: "focus", from: "detail", duration: 850 };
  const slides = [{ metadata: {} }, { metadata: { transition: focus } }, { metadata: {} }];
  expect(resolveTransition(0, 1, slides).focus).toEqual(focus);
  expect(resolveTransition(1, 0, slides).reverse).toBe(true);
  expect(resolveTransition(1, 0, slides).focus).toEqual(focus);
  expect(resolveTransition(2, 1, slides).kind).toBe("fade");
  expect(resolveTransition(0, 2, slides, focus).kind).toBe("fade");
  expect(resolveTransition(1, 2, [{ metadata: {} }, { metadata: {} }, { metadata: { transition: "none" } }], focus).kind).toBe("none");
  expect(normalizeTransition({ type: "focus", from: "" })).toBeUndefined();
  expect(normalizeTransition({ type: "focus", from: "detail", duration: -2 }).duration).toBe(0);
  expect(normalizeTransition({ type: "focus", from: "detail", duration: Infinity }).duration).toBe(850);
});

test("camera centers and uniformly covers the focus region", () => {
  const region = { x: 400, y: 100, width: 480, height: 300 };
  const camera = focusCamera(region, { width: 1920, height: 1080 });
  expect(camera.scale).toBe(4);
  expect((region.x + region.width / 2) * camera.scale + camera.x).toBe(960);
  expect((region.y + region.height / 2) * camera.scale + camera.y).toBe(540);
});

test("live shared children retain their instance and follow the same rectangle through the camera zoom", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const surface = createFocusSurface();
  const source = { x: 200, y: 100, width: 320, height: 180 };
  const destination = { x: 800, y: 300, width: 640, height: 360 };
  const region = { x: 150, y: 80, width: 500, height: 300 };
  const camera = focusCamera(region, { width: 1920, height: 1080 });
  const progress = new Animated.Value(0);
  const motion = createFocusMotion(progress, undefined, camera);
  motion.elements.set("live", { from: source, to: destination, own: source });
  let mounts = 0;
  function Live() { const [instance] = useState(() => ++mounts); return <live instance={instance} />; }
  const render = (activeMotion) => <FocusSurfaceContext.Provider value={{ surface, motion: activeMotion }}>
    <FocusStage><FocusRegion id="detail" testID="region"><SharedElement id="live" testID="shared"><Live /></SharedElement></FocusRegion></FocusStage>
  </FocusSurfaceContext.Provider>;
  let tree;
  try {
    await act(() => { tree = create(render(undefined), { createNodeMock: ({ props }) => ({
      measureLayout: (_root, done) => { const rect = props.testID === "region" ? region : source; done(rect.x, rect.y, rect.width, rect.height); },
    }) }); });
    const measured = await measureFocusSurface(surface);
    expect(measured.regions.get("detail")).toEqual(region);
    expect(measured.elements.get("live")).toEqual(source);
    const root = surface.root;
    await act(() => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 1920, height: 1080 } } }));
    expect([surface.width, surface.height]).toEqual([1920, 1080]);
    await act(() => tree.update(render(motion)));
    expect(surface.root).toBe(root);
    const shared = tree.root.findAllByType("layer").find((layer) => layer.props.style[1]?.transform?.length === 4);
    const transform = shared.props.style[1].transform;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      progress.setValue(t);
      const scale = 1 + (camera.scale - 1) * t;
      const x = transform[0].translateX.__getValue();
      const y = transform[1].translateY.__getValue();
      expect((source.x + source.width / 2 + x) * scale + camera.x * t)
        .toBeCloseTo(source.x + source.width / 2 + (destination.x + destination.width / 2 - source.x - source.width / 2) * t);
      expect((source.y + source.height / 2 + y) * scale + camera.y * t)
        .toBeCloseTo(source.y + source.height / 2 + (destination.y + destination.height / 2 - source.y - source.height / 2) * t);
      expect(source.width * transform[2].scaleX.__getValue() * scale).toBeCloseTo(source.width + (destination.width - source.width) * t);
    }
    await act(() => tree.update(render(undefined)));
    expect(mounts).toBe(1);
    expect(tree.root.findByType("live").props.instance).toBe(1);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
  expect(surface.entries.size).toBe(0);
  expect(surface.root).toBeNull();
});

test("ambiguous IDs and unmeasurable views are omitted without stalling navigation", async () => {
  const surface = createFocusSurface();
  surface.root = {};
  const rect = { x: 0, y: 0, width: 100, height: 100 };
  const view = { measureLayout: (_root, done) => done(rect.x, rect.y, rect.width, rect.height) };
  surface.entries.add({ id: "duplicate", kind: "element", view });
  surface.entries.add({ id: "duplicate", kind: "element", view });
  surface.entries.add({ id: "missing", kind: "region", view: { measureLayout() {} } });
  surface.entries.add({ id: "zero", kind: "element", view: { measureLayout: (_root, done) => done(0, 0, 0, 0) } });
  const measured = await measureFocusSurface(surface);
  expect(measured.elements.size).toBe(0);
  expect(measured.regions.size).toBe(0);
});

test("framework labels move without stretching while bars resize from their fixed left edge", async () => {
  const surface = createFocusSurface();
  const progress = new Animated.Value(0);
  const motion = createFocusMotion(progress);
  const fromBar = { x: 285, y: 55, width: 400, height: 30 };
  const toBar = { x: 285, y: 340, width: 900, height: 30 };
  const fromLabel = { x: 0, y: 55, width: 280, height: 43 };
  const toLabel = { x: 0, y: 340, width: 280, height: 43 };
  motion.elements.set("benchmark-React Native-bar", { from: fromBar, to: toBar, own: fromBar });
  motion.elements.set("benchmark-React Native-label", { from: fromLabel, to: toLabel, own: fromLabel });
  let tree;
  try {
    await act(() => { tree = create(<FocusSurfaceContext.Provider value={{ surface, motion }}>
      <SharedElement id="benchmark-React Native-label" resize="preserve" testID="label"><span /></SharedElement>
      <SharedElement id="benchmark-React Native-bar" testID="bar"><span /></SharedElement>
    </FocusSurfaceContext.Provider>); });
    const layers = tree.root.findAllByType("layer");
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      progress.setValue(t);
      const label = layers.find(layer => layer.props.testID === "label").props.style[1].transform;
      const bar = layers.find(layer => layer.props.testID === "bar").props.style[1].transform;
      expect(label[2].scaleX.__getValue()).toBe(1);
      expect(label[3].scaleY.__getValue()).toBe(1);
      expect(fromLabel.y + label[1].translateY.__getValue()).toBeCloseTo(55 + 285 * t);
      const width = fromBar.width * bar[2].scaleX.__getValue();
      expect(width).toBeCloseTo(400 + 500 * t);
      expect(fromBar.x + fromBar.width / 2 + bar[0].translateX.__getValue() - width / 2).toBeCloseTo(285);
      expect(fromBar.y + bar[1].translateY.__getValue()).toBeCloseTo(55 + 285 * t);
    }
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});


test("transition preparation measures only matching elements and its requested camera region", async () => {
  const from = createFocusSurface(), to = createFocusSurface();
  from.root = {}; to.root = {};
  const measured = [];
  const add = (surface, id, kind = "element", responds = true) => surface.entries.add({ id, kind,
    view: { measureLayout: (_root, done) => {
      measured.push(id);
      if (responds) done(10, 20, 100, 50);
    } },
  });
  for (const surface of [from, to]) add(surface, "title");
  add(from, "outgoing-only", "element", false);
  add(to, "incoming-only", "element", false);
  add(from, "zoom", "region");
  add(to, "zoom", "region", false);
  const [source, destination] = await measureFocusPair(from, to, { from: "zoom" });
  expect(measured.sort()).toEqual(["title", "title", "zoom"]);
  expect(source.elements.has("title")).toBe(true);
  expect(destination.elements.has("title")).toBe(true);
  expect(source.regions.has("zoom")).toBe(true);
  expect(destination.regions.size).toBe(0);
  measured.length = 0;
  await measureFocusPair(to, from, { from: "zoom" }, true);
  expect(measured.sort()).toEqual(["title", "title", "zoom"]);
});

test("slides without matching elements never wait for unrelated native callbacks", async () => {
  const from = createFocusSurface(), to = createFocusSurface();
  from.root = {}; to.root = {};
  let calls = 0;
  from.entries.add({ id: "chart", kind: "element", view: { measureLayout() { calls++; } } });
  to.entries.add({ id: "title", kind: "element", view: { measureLayout() { calls++; } } });
  const results = await measureFocusPair(from, to);
  expect(calls).toBe(0);
  expect(results.every(result => result.elements.size === 0)).toBe(true);
});


test("prepared shared geometry needs no native measurements at navigation", async () => {
  const from = createFocusSurface(), to = createFocusSurface();
  let calls = 0;
  for (const surface of [from, to]) {
    surface.root = {};
    surface.entries.add({ id: "title", kind: "element", view: { measureLayout: (_root, done) => {
      calls++; done(surface === from ? 10 : 200, 20, 400, 60);
    } } });
  }
  await Promise.all([prepareFocusSurface(from), prepareFocusSurface(to)]);
  expect(calls).toBe(2);
  const [source, destination] = await measureFocusPair(from, to);
  expect(calls).toBe(2);
  expect(source.elements.get("title").x).toBe(10);
  expect(destination.elements.get("title").x).toBe(200);
  invalidateFocusSurface(to);
  await prepareFocusSurface(to);
  await measureFocusPair(from, to);
  expect(calls).toBe(3);
});

test("layout invalidation discards an in-flight snapshot and prepares the new layout", async () => {
  const surface = createFocusSurface(); surface.root = {};
  const callbacks = [];
  surface.entries.add({ id: "bar", kind: "element", view: { measureLayout: (_root, done) => callbacks.push(done) } });
  const first = prepareFocusSurface(surface);
  await Promise.resolve();
  invalidateFocusSurface(surface);
  callbacks.shift()(0, 0, 100, 30);
  await first;
  expect(surface.measurements).toBeUndefined();
  await Promise.resolve();
  const refreshed = surface.preparation;
  callbacks.shift()(0, 200, 500, 30);
  await refreshed;
  const result = await measureFocusSurface(surface);
  expect(result.elements.get("bar")).toEqual({ x: 0, y: 200, width: 500, height: 30 });
  surface.setRoot(null);
  expect(surface.measurements).toBeUndefined();
});
