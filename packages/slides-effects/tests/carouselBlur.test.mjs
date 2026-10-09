import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { transformSync } = createRequire(new URL("../../presentation/package.json", import.meta.url))("esbuild");
import React from "react";
import { createSnapshotCaptureQueue } from "../../presentation/src/snapshotCaptureQueue.ts";

const require = createRequire(new URL("../../../apps/slides/package.json", import.meta.url));
const { act, create } = require("react-test-renderer");

test("carousel blur captures once per layout, preserves live fallback, and cancels late captures", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const frames = new Map();
  const captures = [];
  let nextFrame = 0;
  const oldRequest = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const mocks = {
    react: React,
    "./blurImages": { resizeBlurImage: image => image, disposeBlurImage: image => image.dispose(), blurImages: { acquire: () => undefined } },
    "@legend-apps/presentation": { snapshotCaptureQueue: createSnapshotCaptureQueue() },
    "react-native": { View: "view", StyleSheet: { create: x => x, absoluteFill: {} } },
    "react-native-reanimated": {
      __esModule: true, default: { View: "animated" },
      useSharedValue: value => React.useRef({ value, set(next) { this.value = next; } }).current, runOnUI: fn => fn,
      useAnimatedStyle: fn => ({ get opacity() { return fn().opacity; } }), useDerivedValue: fn => ({ get value() { return fn(); } }),
    },
    "@shopify/react-native-skia": {
      Blur: "blur", Canvas: "canvas", Group: "group", Image: "image", Paint: "paint",
      makeImageFromView: ref => new Promise(resolve => captures.push({ ref, resolve })),
    },
  };
  const compiled = transformSync(readFileSync(new URL("../packs/media/CarouselBlurView.tsx", import.meta.url), "utf8"),
    { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
  const module = { exports: {} };
  Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), module, module.exports);
  const { CarouselBlurView } = module.exports;
  const progress = { value: { position: 0 } };
  const content = () => React.createElement(CarouselBlurView, { progress, index: 1, enabled: true }, React.createElement("content"));
  const flush = () => act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); });
  let renderer;
  let disposed = 0;
  try {
    await act(() => { renderer = create(content(), { createNodeMock: () => ({}) }); });
    assert.equal(captures.length, 0);
    await act(() => renderer.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 800, height: 500 } } }));
    await flush(); await flush();
    assert.equal(captures.length, 1);
    assert.ok(captures[0].ref.current);
    assert.equal(renderer.root.findByType("image").props.image.value, null);
    await act(async () => { captures[0].resolve({ dispose() { disposed++; } }); });
    assert.equal(renderer.root.findAllByType("image").length, 1);
    progress.value.position = 1;
    await act(() => renderer.update(content()));
    await flush();
    assert.equal(captures.length, 1, "navigation must not start a capture loop");
    assert.equal(renderer.root.findAllByType("animated")[0].props.style[1].opacity, 1);
    await act(() => renderer.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 900, height: 500 } } }));
    assert.equal(disposed, 1);
    await flush(); await flush();
    await act(() => renderer.unmount());
    await act(async () => { captures[1].resolve({ dispose() { disposed++; } }); });
    assert.equal(disposed, 2, "late snapshots must be disposed after unmount");
  } finally {
    globalThis.requestAnimationFrame = oldRequest;
    globalThis.cancelAnimationFrame = oldCancel;
  }
});
