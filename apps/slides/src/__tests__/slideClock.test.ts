// @ts-nocheck This suite uses Bun's test globals.
import { expect, test } from "bun:test";
import { getSlidesState, setCurrentSlide, setSlidesState } from "../slidesStore";

test("both windows retain the same epoch until navigation, replay, or audience opening", () => {
  const initial = getSlidesState();
  try {
    setSlidesState({ slides: [{}, {}, {}], currentSlide: 0, audienceOpen: false, slideStartedAt: -10 });
    setSlidesState({ blackout: true, status: "ready" });
    expect(getSlidesState().slideStartedAt).toBe(-10);
    setCurrentSlide(1);
    const slideEpoch = getSlidesState().slideStartedAt;
    expect(slideEpoch).toBeGreaterThanOrEqual(0);
    setCurrentSlide(1);
    expect(getSlidesState().slideStartedAt).toBe(slideEpoch);
    setSlidesState({ slideStartedAt: -20 });
    setCurrentSlide(0);
    expect(getSlidesState().slideStartedAt).toBeGreaterThanOrEqual(0);
    setSlidesState({ slideStartedAt: -30 });
    setSlidesState({ audienceOpen: true });
    expect(getSlidesState().slideStartedAt).toBeGreaterThanOrEqual(0);
    const audienceEpoch = getSlidesState().slideStartedAt;
    setSlidesState({ audienceOpen: true });
    expect(getSlidesState().slideStartedAt).toBe(audienceEpoch);
    setSlidesState({ slideStartedAt: -40 });
    setSlidesState({ retryRevision: getSlidesState().retryRevision + 1 });
    expect(getSlidesState().slideStartedAt).toBeGreaterThanOrEqual(0);
  } finally {
    setSlidesState(initial);
  }
});
