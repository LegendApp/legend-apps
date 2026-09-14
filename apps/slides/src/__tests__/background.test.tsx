// @ts-nocheck Native layout is supplied explicitly by the test.
import { expect, test } from "bun:test";
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
  function Deck({ index, override = false, disabled = false }) {
    return <BackgroundHost slideIndex={index} color="#123">
      {[0, 1, 2].map((slide) => <PresentationProvider key={slide} value={runtime(slide, slide !== index)}>
        <Background priority={-1}><Aurora /></Background>
        {slide === 1 && override && <Background>{disabled ? null : <override />}</Background>}
        <content index={slide} />
      </PresentationProvider>)}
    </BackgroundHost>;
  }
  let tree;
  try {
    await act(() => { tree = create(<Deck index={0} />); });
    await act(() => tree.root.findAllByType("view")[0].props.onLayout({ nativeEvent: { layout: { width: 2560, height: 1080 } } }));
    expect(tree.root.findByType("aurora").props).toEqual({ width: 2560, height: 1080, slideIndex: 0, isActive: true });
    for (const index of [1, 2, 1, 0]) {
      await act(() => tree.update(<Deck index={index} />));
      expect(tree.root.findAllByType("aurora")).toHaveLength(1);
      expect(tree.root.findByType("aurora").props.slideIndex).toBe(index);
      expect(mounts).toBe(1);
      expect(unmounts).toBe(0);
    }
    await act(() => tree.update(<Deck index={1} override />));
    expect(tree.root.findAllByType("aurora")).toHaveLength(0);
    expect(tree.root.findAllByType("override")).toHaveLength(1);
    await act(() => tree.update(<Deck index={1} override disabled />));
    expect(tree.root.findAllByType("aurora")).toHaveLength(0);
    expect(tree.root.findAllByType("override")).toHaveLength(0);
    await act(() => tree.update(<Deck index={0} />));
    expect(tree.root.findAllByType("aurora")).toHaveLength(1);
  } finally {
    if (tree) await act(() => tree.unmount());
  }
});
