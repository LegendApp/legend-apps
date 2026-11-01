import { getDisplays, showWindow } from "@legendapp/spark/windows";
import { loadDeck } from "./deckLoader";
import { getSlideStepCount, getSlidesState, nextSlide, setCurrentSlide } from "./slidesStore";
import { openSlidesAudienceWindow } from "./slidesWindows";

function state() {
  const s = getSlidesState();
  return { status: s.status, deckPath: s.deckPath, buildErrors: s.buildErrors, runtimeErrors: s.runtimeErrors,
    slide: s.currentSlide, step: s.currentStep, steps: s.slides.map(getSlideStepCount) };
}

/** Dev builds only: the control surface `bun run slides:record` drives over the Metro inspector. */
export function installRecorderControl() {
  if (!__DEV__) return;
  (globalThis as { __legendSlidesRecorder?: unknown }).__legendSlidesRecorder = {
    state,
    async open(path: string) {
      await loadDeck(path, false);
      return state();
    },
    /** Opens the audience window full screen on the primary display, as Start Presentation does. */
    async present() {
      const display = (await getDisplays()).find(d => d.primary)!;
      await openSlidesAudienceWindow(display, true);
      await showWindow("slides-audience", { focus: true });
      return display;
    },
    go(slide: number) {
      setCurrentSlide(slide);
      return state();
    },
    next() {
      nextSlide();
      return state();
    },
  };
}
