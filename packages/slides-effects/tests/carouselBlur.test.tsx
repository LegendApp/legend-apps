// @ts-nocheck Native readbacks complete independently of React rendering.
import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, mock, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";
const jobs = [];
let resolveCapture, nativeCaptures = 0;
mock.module("@legend-apps/presentation", () => ({ snapshotCaptureQueue: {
  enqueue(run) { const job = { run, cancelled: false }; jobs.push(job); return () => { job.cancelled = true; }; },
} }));
mock.module("@shopify/react-native-skia", () => ({ Canvas: "canvas", Image: "sk-image", Blur: "blur", Group: "group", Paint: "paint",
  makeImageFromView: () => { nativeCaptures++; return new Promise(resolve => { resolveCapture = resolve; }); },
}));
const { createSnapshotImageCache } = await import("../../presentation/src/snapshotImageCache");
const cache = createSnapshotImageCache({ dispose: image => image.dispose() });
mock.module("../packs/media/blurImages", () => ({ blurImages: cache, resizeBlurImage: image => image, disposeBlurImage: image => image.dispose() }));
const { CarouselBlurView } = await import("../packs/media/CarouselBlurView");
test("layout and capture completion publish shared values without React commits, cancelling stale captures", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const progress = { value: { position: 0 } };
  let commits = 0, disposed = 0, tree;
  const content = enabled => <Profiler id="blur" onRender={() => commits++}><CarouselBlurView enabled={enabled} progress={progress} index={1}><content /></CarouselBlurView></Profiler>;
  const layout = width => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width, height: 50 } } });
  try {
    await act(() => { tree = create(content(true)); });
    const initial = commits;
    await act(() => layout(100));
    expect(commits).toBe(initial);
    expect(jobs).toHaveLength(1);
    const first = jobs[0].run();
    const image = { dispose: () => disposed++ };
    await act(async () => { resolveCapture(image); await first; });
    expect(commits).toBe(initial);
    const snapshot = tree.root.findByType("sk-image");
    expect(snapshot.props.image.value).toBe(image);
    expect(snapshot.props.width.value).toBe(100);
    await act(() => layout(100));
    expect(jobs).toHaveLength(1);
    await act(() => layout(0));
    expect(disposed).toBe(1);
    await act(() => layout(200));
    expect(disposed).toBe(1);
    expect(commits).toBe(initial);
    const second = jobs[1].run();
    await act(() => tree.update(content(false)));
    await act(async () => { resolveCapture({ dispose: () => disposed++ }); await second; });
    expect(disposed).toBe(2);
    expect(tree.root.findAllByType("canvas")).toHaveLength(0);
  } finally { if (tree) await act(() => tree.unmount()); }
});

test("deferred canvas construction keeps live content until its capture surface commits", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jobs.length = 0;
  const progress = { value: { position: 0 } };
  let tree;
  const content = enabled => <CarouselBlurView enabled={enabled} progress={progress} index={1}><content /></CarouselBlurView>;
  try {
    await act(() => { tree = create(content(false)); });
    const layout = width => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width, height: 50 } } });
    await act(() => layout(100));
    await act(() => {
      tree.unstable_flushSync(() => tree.update(content(true)));
      expect(tree.root.findAllByType("canvas")).toHaveLength(0);
      layout(200);
      expect(jobs).toHaveLength(0);
    });
    expect(tree.root.findAllByType("canvas")).toHaveLength(1);
    expect(jobs).toHaveLength(1);
  } finally { if (tree) await act(() => tree.unmount()); }
});


test("static snapshots are shared across windows and reused after unmount, without a new readback or React commit", async () => {
  jobs.length = 0; cache.clear();
  const progress = { value: { position: 0 } };
  let a, b, commits = 0, disposed = 0;
  const content = key => <Profiler id="cached" onRender={() => commits++}><CarouselBlurView enabled progress={progress} index={1} cacheKey={key}><content /></CarouselBlurView></Profiler>;
  const layout = tree => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 100, height: 50 } } });
  try {
    await act(() => { a = create(content("poster")); b = create(content("poster")); });
    await act(() => { layout(a); layout(b); });
    expect(jobs).toHaveLength(2);
    const first = jobs[0].run(), initial = commits;
    const image = { width: () => 100, height: () => 50, dispose: () => disposed++ };
    await act(async () => { resolveCapture(image); await first; await jobs[1].run(); });
    expect(a.root.findByType("sk-image").props.image.value).toBe(image);
    expect(b.root.findByType("sk-image").props.image.value).toBe(image);
    expect(commits).toBe(initial);
    await act(() => a.unmount()); a = undefined;
    expect(disposed).toBe(0);
    await act(() => { a = create(content("poster")); });
    await act(() => layout(a));
    expect(jobs).toHaveLength(2);
    expect(a.root.findByType("sk-image").props.image.value).toBe(image);
    cache.clear(); expect(disposed).toBe(0);
    await act(() => a.unmount()); a = undefined; expect(disposed).toBe(0);
    await act(() => b.unmount()); b = undefined; expect(disposed).toBe(1);
  } finally { await act(() => { a?.unmount(); b?.unmount(); }); cache.clear(); }
});


test("mounted posters keep live fallback until onLoad, crossfade on the UI clock, and cancel stale loads", async () => {
  jobs.length = 0; cache.clear(); nativeCaptures = 0;
  const progress = { value: { position: 0 } };
  let tree, commits = 0;
  const content = (poster = "recording.png", enabled = true) => <Profiler id="poster" onRender={() => commits++}>
    <CarouselBlurView enabled={enabled} progress={progress} index={1} poster={poster} posterTop={10}><video /></CarouselBlurView>
  </Profiler>;
  const opacity = () => tree.root.findAllByType("animated-view").map(view => view.props.style[1].value.opacity);
  try {
    await act(() => { tree = create(content()); });
    const firstLoad = tree.root.findByType("image").props.onLoad;
    const initial = commits;
    expect(opacity()).toEqual([1, 0]);
    expect(tree.root.findByType("image").props.blurRadius).toBe(10);
    expect(tree.root.findByType("image").props.resizeMode).toBe("contain");
    expect(tree.root.findAllByType("canvas")).toHaveLength(0);
    expect(jobs).toHaveLength(0);
    expect(nativeCaptures).toBe(0);
    progress.value.position = 0.5;
    expect(opacity()).toEqual([1, 0]);
    await act(() => firstLoad());
    expect(opacity()).toEqual([0.5, 0.5]);
    expect(commits).toBe(initial);
    progress.value.position = 1;
    expect(opacity()).toEqual([1, 0]);
    progress.value.position = 0;
    expect(opacity()).toEqual([0, 1]);
    await act(() => tree.update(content("replacement.png")));
    expect(opacity()).toEqual([1, 0]);
    await act(() => firstLoad());
    expect(opacity()).toEqual([1, 0]);
    await act(() => tree.root.findByType("image").props.onLoad());
    expect(opacity()).toEqual([0, 1]);
    await act(() => tree.update(content("replacement.png", false)));
    expect(opacity()).toEqual([1, 0]);
    await act(() => tree.update(content("replacement.png", true)));
    expect(opacity()).toEqual([0, 1]);
    const lateLoad = tree.root.findByType("image").props.onLoad;
    await act(() => tree.unmount()); tree = undefined;
    await act(() => lateLoad());
  } finally { if (tree) await act(() => tree.unmount()); cache.clear(); }
});

test("poster captions retain a native text snapshot and media header geometry", async () => {
  jobs.length = 0;
  let tree;
  try {
    await act(() => { tree = create(<CarouselBlurView enabled progress={{ value: { position: 0 } }} index={1}
      poster="captioned.png" posterTop={100} posterCaption="Sample app"><video /></CarouselBlurView>); });
    await act(() => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 1600, height: 1000 } } }));
    expect(tree.root.findByType("text").props.style).toEqual({ color: "#f8fafc", fontSize: 1600 * 0.035, fontWeight: "600" });
    expect(tree.root.findAllByType("canvas")).toHaveLength(1);
    const body = tree.root.findByType("image").parent.props.style[1];
    expect(body).toEqual({ top: 100, borderRadius: 12, overflow: "hidden", backgroundColor: "#14253a" });
  } finally { if (tree) await act(() => tree.unmount()); }
});


test("a preview poster load cannot hide the audience live fallback", async () => {
  let audience, preview;
  const content = position => <CarouselBlurView enabled progress={{ value: { position } }} index={1} poster="shared.png"><video /></CarouselBlurView>;
  try {
    await act(() => { audience = create(content(0)); preview = create(content(1)); });
    await act(() => preview.root.findByType("image").props.onLoad());
    expect(audience.root.findAllByType("animated-view")[0].props.style[1].value.opacity).toBe(1);
    expect(audience.root.findAllByType("animated-view")[1].props.style[1].value.opacity).toBe(0);
    expect(preview.root.findAllByType("animated-view")[0].props.style[1].value.opacity).toBe(1);
    await act(() => audience.root.findByType("image").props.onLoad());
    expect(audience.root.findAllByType("animated-view")[0].props.style[1].value.opacity).toBe(0);
    expect(preview.root.findAllByType("animated-view")[0].props.style[1].value.opacity).toBe(1);
  } finally { await act(() => { audience?.unmount(); preview?.unmount(); }); }
});
