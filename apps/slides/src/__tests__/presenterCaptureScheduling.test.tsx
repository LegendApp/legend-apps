// @ts-nocheck Exercise workspace scheduling without native window services.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";

test("rehearsal follows input immediately while hidden capture waits for settlement", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const file = new URL("../PresenterWindow.tsx", import.meta.url).pathname;
  const require = createRequire(file);
  const { code } = transformSync(readFileSync(file, "utf8"), {
    filename: file, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [() => ({ visitor: { Program(program) {
      program.node.body = program.node.body.filter(node => node.type === "FunctionDeclaration" && node.id.name === "PresenterWorkspace");
    } } })],
  });
  let audienceOpen = false, settled = "1:0:1:1", stills = {}, loading = false;
  const layout = { notesRatio: .3, currentPreviewRatio: .7 };
  const dependencies = {
    useValue: value => value.get(), useObservable: () => ({ get: () => layout, peek: () => layout }),
    useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback,
    slidesState$: { audienceOpen: { get: () => audienceOpen } },
    useAudienceSettled: (navigation, enabled) => enabled ? settled : navigation,
    usePreviewStills: () => ({ stills, targets: [], sweep: { generation: "one", loading } }),
    stillKey: (index, step) => `${index}:${step}`,
    View: "view", Preview: "preview", SlideCounter: "counter", PreviewStillSweep: "capture-sweep", PreviewStillCapture: "capture-live", ResizeHandle: "resize",
    PresenterPreview: "preview-frame", DeferredPresenterPreview: "deferred-preview", PreviewStillStack: "preview-still",
    styles: {},
  };
  const Workspace = Function(...Object.keys(dependencies), "require", "exports", code + "\nreturn PresenterWorkspace;")(
    ...Object.values(dependencies), require, {},
  );
  const content = <Workspace currentIndex={2} currentStep={1} nextIndex={2} nextStep={2} resetVersion={0} showNext showNotes={false} />;
  let renderer;
  try {
    await act(() => { renderer = create(content); });
    expect(renderer.root.findByType("capture-sweep").props.paused).toBe(true);
    expect(renderer.root.findAllByType("preview").map(node => [node.props.index, node.props.stepIndex])).toEqual([[2, 1], [2, 2]]);
    settled = "2:1:2:2";
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findByType("capture-sweep").props.paused).toBe(false);
    audienceOpen = true;
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findByType("capture-sweep").props.paused).toBe(true);
    settled = "1:0:1:1";
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findByType("preview-frame").props.pending).toBe(true);
    expect(renderer.root.findAllByType("preview")[0].props).toMatchObject({ index: 1, stepIndex: 0 });
    expect(renderer.root.findAllByType("preview").every(node => node.props.capture.paused)).toBe(true);
    expect(renderer.root.findByType("deferred-preview").props.pending).toBe(true);
    stills = { "1:0": "old current", "1:1": "old next" };
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findAllByType("preview").map(node => node.props.still?.props.target)).toEqual(["1:0", "1:1"]);
    stills = { "2:1": "current", "2:2": "next" };
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findByType("preview-frame").props.pending).toBe(false);
    expect(renderer.root.findByType("deferred-preview").props.pending).toBe(false);
    expect(renderer.root.findByType("deferred-preview").props.immediate).toBe(true);
    expect(renderer.root.findAllByType("preview").map(node => [node.props.index, node.props.stepIndex])).toEqual([[2, 1], [2, 2]]);
    loading = true;
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findAllByType("preview")).toHaveLength(0);
    expect(renderer.root.findByType("preview-frame").props.pending).toBe(true);
    loading = false;
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findAllByType("preview").map(node => node.props.still.props.target)).toEqual(["2:1", "2:2"]);
  } finally { await act(() => renderer?.unmount()); }
});

function createPreview(Canvas = "canvas", Retained = "retained") {
  const file = new URL("../PresenterWindow.tsx", import.meta.url).pathname, require = createRequire(file);
  const { code } = transformSync(readFileSync(file, "utf8"), {
    filename: file, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [() => ({ visitor: { Program(program) {
      program.node.body = program.node.body.filter(node => node.type === "FunctionDeclaration" && node.id.name === "Preview");
    } } })],
  });
  return Function("useState", "View", "SlideCanvas", "DeckRenderer", "styles", "RetainedSurface", "PreviewStillCapture", "SlideCounter", "require", "exports", code + "\nreturn Preview;")(
    React.useState, "view", Canvas, "deck", {}, Retained, "capture", "counter", require, {});
}

test("both preview panes preserve the audience aspect before rendering or capturing a background", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const Preview = createPreview();
  let renderer;
  try {
    await act(() => { renderer = create(<Preview index={1} stepIndex={2} aspect={16/9} capture={{generation:"one"}}/>); });
    expect(renderer.root.findAllByType("canvas")).toHaveLength(0);
    for (const [width,height,w,h] of [[800,300,1600/3,300],[400,300,400,225]]) {
      await act(() => renderer.root.findAllByType("view")[0].props.onLayout({nativeEvent:{layout:{width,height}}}));
      const style = renderer.root.findAllByType("view")[1].props.style[1];
      expect(style.width).toBeCloseTo(w); expect(style.height).toBeCloseTo(h);
      expect(style.width / style.height).toBeCloseTo(16/9);
      expect(renderer.root.findAllByType("canvas")).toHaveLength(1);
      expect(renderer.root.findByType("counter").props).toMatchObject({index:1,stepIndex:2});
      expect(renderer.root.findByType("retained").props.identity).toBe("one:1:live");
    }
  } finally { await act(() => renderer?.unmount()); }
});


test("preview replacement retains the drawn scene, label and capture target until GPU readiness", async () => {
  const { RetainedSurface } = await import("../../../../packages/presentation/src/RetainedSurface");
  const { usePreparationTask } = await import("../../../../packages/presentation/src/PreparationBoundary");
  function Canvas({ children, targetIndex, waiting }) { usePreparationTask(targetIndex === 1 && waiting); return <canvas index={targetIndex}>{children}</canvas>; }
  let waiting = true;
  const Preview = createPreview(props => <Canvas {...props} waiting={waiting}/>, RetainedSurface);
  const content = index => <Preview index={index} stepIndex={0} capture={{generation:"one",target:`${index}:0`}}/>;
  let tree;
  try {
    await act(()=>{tree=create(content(0));});
    await act(()=>tree.root.findAllByType("view")[0].props.onLayout({nativeEvent:{layout:{width:800,height:400}}}));
    expect(tree.root.findAllByType("counter").map(v=>v.props.index)).toEqual([0]);
    await act(()=>tree.update(content(1)));
    expect(tree.root.findAllByType("canvas").map(v=>v.props.index)).toEqual([0,1]);
    expect(tree.root.findAllByType("counter").map(v=>v.props.index)).toEqual([0,1]);
    expect(tree.root.findAllByType("capture").map(v=>v.props.target)).toEqual(["0:0","1:0"]);
    waiting=false;
    await act(()=>tree.update(content(1)));
    expect(tree.root.findAllByType("canvas").map(v=>v.props.index)).toEqual([1]);
    expect(tree.root.findAllByType("counter").map(v=>v.props.index)).toEqual([1]);
  } finally {await act(()=>tree?.unmount());}
});


test("same-slide live reveals preserve the existing preview canvas", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { RetainedSurface } = await import("../../../../packages/presentation/src/RetainedSurface");
  let mounts=0;
  function Canvas({targetStep}) { React.useEffect(()=>{mounts++;},[]);return <canvas step={targetStep}/>; }
  const Preview = createPreview(Canvas, RetainedSurface);
  const content = step => <Preview index={1} stepIndex={step} capture={{generation:"one",target:`1:${step}`}}/>;
  let tree;
  try {
    await act(()=>{tree=create(content(0));});
    await act(()=>tree.root.findAllByType("view")[0].props.onLayout({nativeEvent:{layout:{width:800,height:400}}}));
    for(const step of [1,2,0]) {
      await act(()=>tree.update(content(step)));
      expect(tree.root.findByType("canvas").props.step).toBe(step);
      expect(tree.root.findByType("counter").props.stepIndex).toBe(step);
      expect(tree.root.findByType("capture").props.target).toBe(`1:${step}`);
      expect(mounts).toBe(1);
    }
  } finally {await act(()=>tree?.unmount());}
});
