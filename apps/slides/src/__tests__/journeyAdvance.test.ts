import { expect, test } from "bun:test";
import { registerAdvanceGuard } from "../../../../packages/presentation/src/advanceGuard";
import { getSlidesState, nextSlide, previousSlide, setSlidesState } from "../slidesStore";

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("early next keeps the current surface until its build completes and coalesces repeat presses", async () => {
  const initial = getSlidesState();
  let finish!: () => void, requests = 0;
  const remove = registerAdvanceGuard(() => { requests++; return new Promise<void>(resolve => { finish = resolve; }); });
  try {
    setSlidesState({ currentSlide: 0, currentStep: 0, slides: [{ metadata: { steps: 3 }, notes: "" }] });
    nextSlide(); nextSlide();
    expect(requests).toBe(1);
    expect(getSlidesState().currentStep).toBe(0);
    finish(); await flush();
    expect(getSlidesState().currentStep).toBe(1);
  } finally { remove(); setSlidesState(initial); }
});

test("back cancels a pending advance and carries backward direction across slide entry", async () => {
  const initial = getSlidesState();
  let finish!: () => void;
  const remove = registerAdvanceGuard(() => new Promise<void>(resolve => { finish = resolve; }));
  try {
    setSlidesState({ currentSlide: 1, currentStep: 0, slides: [0, 1].map(() => ({ metadata: { steps: 2 }, notes: "" })) });
    nextSlide(); previousSlide();
    expect(getSlidesState()).toMatchObject({ currentSlide: 0, currentStep: 1, direction: "backward" });
    finish(); await flush();
    expect(getSlidesState()).toMatchObject({ currentSlide: 0, currentStep: 1 });
  } finally { remove(); setSlidesState(initial); }
});
