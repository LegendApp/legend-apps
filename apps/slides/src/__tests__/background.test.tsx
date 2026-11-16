// @ts-nocheck Native layout is supplied explicitly by the test.
import { expect, spyOn, test } from "bun:test";
import { observable } from "@legendapp/state";
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { flushIdleCallbacks } from "./nativeMock";
import { Background, BackgroundHost, useBackgroundSize } from "../../../../packages/presentation/src/background";
import { PresentationObservableProvider, PresentationProvider, usePresentation } from "../../../../packages/presentation/src/runtime";

const runtime = (index, preparing = false) => ({ slideIndex: index, isActive: !preparing, isPreparing: preparing, isPreview: preparing });

test("a template background persists across prepared slides and fills the viewport", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mounts = 0;
  let unmounts = 0;
  function Aurora() {
    const size = useBackgroundSize();
    const { slideIndex, isActive } = usePresentation();
    useEffect(() => { mounts++; return () => { unmounts++; }; }, []);
    return <aurora {...size} slideIndex={slideIndex} isActive={isActive} />;
  }
  const runtimes = [0, 1, 2].map((index) => observable(runtime(index, index !== 0)));
  function content(index, override = false, disabled = false) {
    runtimes.forEach((value, slide) => value.set(runtime(slide, slide !== index)));
    return <Deck index={index} override={override} disabled={disabled} />;
  }
  function Deck({ index, override = false, disabled = false }) {
    return <BackgroundHost slideIndex={index} color="#123">
      {[0, 1, 2].map((slide) => <PresentationProvider key={slide} value={runtimes[slide]}>
        <Background priority={-1}><Aurora /></Background>
        {slide === 1 && override && <Background>{disabled ? null : <override />}</Background>}
        <content index={slide} />
      </PresentationProvider>)}
    </BackgroundHost>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    await act(() => { tree = create(content(0)); });
    await act(() => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 2560, height: 1080 } } }));
    expect(tree.root.findByType("aurora").props).toEqual({ width: 2560, height: 1080, slideIndex: 0, isActive: true });
    for (const index of [1, 2, 1, 0]) {
      await act(() => tree.update(content(index)));
      expect(tree.root.findAllByType("aurora")).toHaveLength(1);
      expect(tree.root.findByType("aurora").props.slideIndex).toBe(index);
      expect(mounts).toBe(1);
      expect(unmounts).toBe(0);
    }
    await act(() => tree.update(content(1, true)));
    expect(tree.root.findAllByType("aurora")).toHaveLength(0);
    expect(tree.root.findAllByType("override")).toHaveLength(1);
    await act(() => tree.update(content(1, true, true)));
    expect(tree.root.findAllByType("aurora")).toHaveLength(0);
    expect(tree.root.findAllByType("override")).toHaveLength(0);
    await act(() => tree.update(content(0)));
    expect(tree.root.findAllByType("aurora")).toHaveLength(1);
    expect(log.mock.calls.some((args) => args.join(" ").includes("Cannot update a component"))).toBe(false);
  } finally {
    if (tree) await act(() => tree.unmount());
    log.mockRestore();
  }
});

test("background failures stay contained and recover on navigation without remounting healthy backgrounds", async () => {
  const { ContentErrorBoundary } = await import("../ContentErrorBoundary");
  const errors = [];
  function Boundary({ children }) {
    const { slideIndex } = usePresentation();
    return <ContentErrorBoundary resetKey={String(slideIndex)} fallback={<fallback />} onError={error => errors.push(error.message)}>{children}</ContentErrorBoundary>;
  }
  function Broken() { throw new Error("bad background"); }
  const values = [0, 1].map(i => observable(runtime(i)));
  function Deck({ index }) {
    return <BackgroundHost slideIndex={index} color="black" boundary={Boundary}>
      <controls />
      {[0, 1].map(i => <PresentationProvider key={i} value={values[i]}>
        <Background>{i === 0 ? <Broken /> : <healthy />}</Background>
        <slide index={i} />
      </PresentationProvider>)}
    </BackgroundHost>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let tree;
  try {
    await act(() => { tree = create(<Deck index={0} />); });
    expect(tree.root.findAllByType("controls")).toHaveLength(1);
    expect(tree.root.findAllByType("slide")).toHaveLength(2);
    expect(tree.root.findAllByType("fallback")).toHaveLength(1);
    expect(errors).toEqual(["bad background"]);
    await act(() => tree.update(<Deck index={1} />));
    expect(tree.root.findAllByType("healthy")).toHaveLength(1);
    expect(tree.root.findAllByType("fallback")).toHaveLength(0);
  } finally { if (tree) await act(() => tree.unmount()); log.mockRestore(); }
});


test("background GPU readiness propagates to a containing surface boundary", async () => {
  const { PreparationBoundary, usePreparationTask } = await import("../../../../packages/presentation/src/PreparationBoundary");
  let ready=0, tree;
  function GPU({ waiting }) { usePreparationTask(waiting); return <gpu/>; }
  const runtime$ = observable({slideIndex:0,stepIndex:0,isActive:true});
  const content = waiting => <PreparationBoundary onReady={()=>ready++}><BackgroundHost slideIndex={0} color="black">
    <PresentationObservableProvider value={runtime$}><Background><GPU waiting={waiting}/></Background></PresentationObservableProvider>
  </BackgroundHost></PreparationBoundary>;
  try {
    await act(()=>{tree=create(content(true));});
    expect(ready).toBe(0);
    await act(()=>tree.update(content(false)));
    expect(ready).toBe(1);
  } finally { await act(()=>tree?.unmount()); }
});

test("prepared slides warm their background content in idle time", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const warmed = [];
  function Scene() { return <scene />; }
  Scene.prepareBackground = props => warmed.push(props.slide);
  const runtimes = [observable(runtime(0)), observable(runtime(1, true))];
  let tree;
  try {
    await act(() => {
      tree = create(<BackgroundHost slideIndex={0} color="#123">
        {runtimes.map((value, slide) => <PresentationProvider key={slide} value={value}>
          <Background><><Scene slide={slide} /></></Background>
        </PresentationProvider>)}
      </BackgroundHost>);
    });
    expect(warmed).toEqual([]);
    await act(flushIdleCallbacks);
    expect(warmed).toEqual([1]);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});
