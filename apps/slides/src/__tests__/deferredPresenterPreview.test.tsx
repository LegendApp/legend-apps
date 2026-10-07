// @ts-nocheck Test host views expose committed preview targets and accessibility state.
import { expect, mock, spyOn, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";

mock.module("react-native", () => ({
  View: "view",
  ActivityIndicator: "spinner",
  StyleSheet: { create: value => value, absoluteFillObject: {} },
}));
const { DeferredPresenterPreview } = await import("../DeferredPresenterPreview");

async function harness(run) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  const renders = [], commits = [];
  let renderer;
  function Preview({ target }) {
    renders.push(target);
    return <preview target={target} />;
  }
  function Pair({ current, next }) {
    return <>
      <Preview target={`current:${current}`} />
      <DeferredPresenterPreview weight={0.4}><Preview target={`next:${next}`} /></DeferredPresenterPreview>
    </>;
  }
  const content = (current, next) => <Profiler id="previews" onRender={() => {
    const views = renderer.root.findAllByType("view");
    commits.push({
      rendered: renders.splice(0),
      targets: renderer.root.findAllByType("preview").map(view => view.props.target),
      pending: renderer.root.findAllByType("spinner").length > 0,
      hidden: views.some(view => view.props.accessibilityElementsHidden && view.props.importantForAccessibility === "no-hide-descendants" && view.props.pointerEvents === "none"),
    });
  }}><Pair current={current} next={next} /></Profiler>;
  try {
    await act(() => { renderer = create(content(0, 1)); });
    await run({
      commits,
      update: (current, next) => act(() => renderer.update(content(current, next))),
      updateImmediately: (current, next) => renderer.unstable_flushSync(() => renderer.update(content(current, next))),
      flush: () => act(() => {}),
    });
  } finally {
    if (renderer) await act(() => renderer.unmount());
    log.mockRestore();
  }
}

test("current preview commits before the initial heavy next preview", () => harness(async h => {
  expect(h.commits[0]).toEqual({ rendered: ["current:0"], targets: ["current:0"], pending: true, hidden: true });
  expect(h.commits[1]).toEqual({ rendered: ["next:1"], targets: ["current:0", "next:1"], pending: false, hidden: false });
}));

test("navigation hides the retained next preview without rendering it in the urgent commit", () => harness(async h => {
  h.commits.length = 0;
  await h.update(1, 2);
  expect(h.commits[0]).toEqual({ rendered: ["current:1"], targets: ["current:1", "next:1"], pending: true, hidden: true });
  expect(h.commits[1]).toEqual({ rendered: ["next:2"], targets: ["current:1", "next:2"], pending: false, hidden: false });
}));

test("rapid navigation cancels obsolete next targets and reveals only the newest preview", () => harness(async h => {
  h.commits.length = 0;
  await act(() => {
    h.updateImmediately(1, 2);
    h.updateImmediately(2, 3);
  });
  expect(h.commits.flatMap(commit => commit.rendered)).not.toContain("next:2");
  expect(h.commits.at(-1)).toMatchObject({ targets: ["current:2", "next:3"], pending: false, hidden: false });
  expect(h.commits.slice(0, -1).every(commit => commit.pending && commit.hidden)).toBe(true);
}));

test("resizing the preview leaves stable slide content visible without another render", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renders = 0, renderer;
  function Preview() { renders++; return <preview />; }
  const preview = <Preview />;
  try {
    await act(() => { renderer = create(<DeferredPresenterPreview weight={0.4}>{preview}</DeferredPresenterPreview>); });
    expect(renders).toBe(1);
    await act(() => renderer.update(<DeferredPresenterPreview weight={0.6}>{preview}</DeferredPresenterPreview>));
    expect(renders).toBe(1);
    expect(renderer.root.findAllByType("spinner")).toHaveLength(0);
    expect(renderer.root.findAllByType("view")[0].props.style[1]).toEqual({ flex: 0.6 });
  } finally {
    if (renderer) await act(() => renderer.unmount());
    log.mockRestore();
  }
});
