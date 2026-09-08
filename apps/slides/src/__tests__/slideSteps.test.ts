// @ts-nocheck This suite uses Bun's test globals.
import { expect, test } from "bun:test";
import {
  getNextPresentationTarget,
  getSlidesState,
  nextSlide,
  previousSlide,
  setCurrentSlide,
  setSlidesState,
} from "../slidesStore";

const slides = [1, 3, 1].map((steps) => ({ metadata: { steps }, notes: "" }));

test("navigation consumes slide steps before changing slides", () => {
  const initial = getSlidesState();
  try {
    setSlidesState({ currentSlide: 0, currentStep: 0, slides });

    nextSlide();
    expect(getSlidesState()).toMatchObject({ currentSlide: 1, currentStep: 0 });
    nextSlide();
    expect(getSlidesState()).toMatchObject({ currentSlide: 1, currentStep: 1 });
    nextSlide();
    expect(getSlidesState()).toMatchObject({ currentSlide: 1, currentStep: 2 });
    nextSlide();
    expect(getSlidesState()).toMatchObject({ currentSlide: 2, currentStep: 0 });

    previousSlide();
    expect(getSlidesState()).toMatchObject({ currentSlide: 1, currentStep: 2 });
    previousSlide();
    expect(getSlidesState()).toMatchObject({ currentSlide: 1, currentStep: 1 });

    setCurrentSlide(1);
    expect(getSlidesState()).toMatchObject({ currentSlide: 1, currentStep: 0 });
  } finally {
    setSlidesState(initial);
  }
});

test("the presenter preview targets the next step before the next slide", () => {
  expect(getNextPresentationTarget({ currentSlide: 1, currentStep: 0, slides }))
    .toEqual({ slideIndex: 1, stepIndex: 1 });
  expect(getNextPresentationTarget({ currentSlide: 1, currentStep: 2, slides }))
    .toEqual({ slideIndex: 2, stepIndex: 0 });
});

test("trigger epochs survive later advances and reset when crossed again", () => {
  const initial = getSlidesState();
  try {
    setSlidesState({ currentSlide: 1, currentStep: 0, slides });
    nextSlide();
    const epoch = getSlidesState().stepEpochs[1];
    nextSlide();
    expect(getSlidesState().stepEpochs[1]).toBe(epoch);
    previousSlide();
    expect(getSlidesState().stepEpochs[1]).toBe(epoch);
    previousSlide();
    expect(getSlidesState().stepEpochs[1]).toBeUndefined();
    nextSlide();
    expect(getSlidesState().stepEpochs[1]).toBeGreaterThanOrEqual(epoch);
  } finally { setSlidesState(initial); }
});
