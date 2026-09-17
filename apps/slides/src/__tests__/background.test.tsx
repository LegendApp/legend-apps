// @ts-nocheck Native layout is supplied explicitly by the test.
import { expect, spyOn, test } from "bun:test";
import { observable } from "@legendapp/state";
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import "./nativeMock";
import { Background, BackgroundHost, useBackgroundSize } from "../../../../packages/presentation/src/background";
import { PresentationProvider, usePresentation } from "../../../../packages/presentation/src/runtime";

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
