// @ts-nocheck This suite uses Bun's test globals.
import { expect, test } from "bun:test";
import { getSlidesState, setCurrentSlide, setSlidesState } from "../slidesStore";

test("slide and step clocks restart at their respective navigation boundaries", () => {
  const initial = getSlidesState();
  try {
    setSlidesState({
      slides: [
        { metadata: { steps: 2 }, notes: "" },
        { metadata: {}, notes: "" },
        { metadata: {}, notes: "" },
      ],
      currentSlide: 0,
      currentStep: 0,
      audienceOpen: false,
      slideStartedAt: -10,
      stepStartedAt: -11,
    });
    setSlidesState({ blackout: true, status: "ready" });
    expect(getSlidesState().slideStartedAt).toBe(-10);
    expect(getSlidesState().stepStartedAt).toBe(-11);
    setSlidesState({ currentStep: 1 });
    expect(getSlidesState().slideStartedAt).toBe(-10);
    expect(getSlidesState().stepStartedAt).toBeGreaterThanOrEqual(0);
    setCurrentSlide(1);
    const slideEpoch = getSlidesState().slideStartedAt;
    const stepEpoch = getSlidesState().stepStartedAt;
    expect(slideEpoch).toBeGreaterThanOrEqual(0);
    expect(stepEpoch).toBeGreaterThanOrEqual(0);
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
