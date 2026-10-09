import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useValue } from "@legendapp/state/react";
const { default: Deck, __legendSlidesTemplates, __legendSlidesTransitions } = require("virtual:deck");
import { DeckRenderer, SlideCanvas } from "../../../apps/slides/src/DeckRenderer";
import { getSlidesState, setSlidesState, slidesState$, nextSlide, previousSlide } from "../../../apps/slides/src/slidesStore";
import { acceptsShortcut, parsePosition } from "./navigation";

setSlidesState({ component: Deck, templates: __legendSlidesTemplates, transitions: __legendSlidesTransitions, status: "ready" });
function readPosition() {
  setSlidesState(parsePosition(location.hash, getSlidesState().slides.map(slide => slide.metadata.steps ?? 1)));
}
window.addEventListener("hashchange", readPosition);
const errors: string[] = [];
window.addEventListener("error", event => { errors.push(event.message); });
window.addEventListener("unhandledrejection", event => { errors.push(String(event.reason)); });
function goTo(slide: number, step = 0) {
  const state = getSlidesState();
  const currentSlide = Math.max(0, Math.min(slide, state.slides.length - 1));
  setSlidesState({ currentSlide, currentStep: Math.max(0, Math.min(step, (state.slides[currentSlide]?.metadata.steps ?? 1) - 1)) });
}
function toggleFullscreen() {
  const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  void action.catch(() => {});
}
function App() {
  const currentSlide = useValue(slidesState$.currentSlide);
  const currentStep = useValue(slidesState$.currentStep);
  const slides = useValue(slidesState$.slides);
  const runtimeErrors = useValue(slidesState$.runtimeErrors);
  const [notes, setNotes] = useState(false);
  const [positionReady, setPositionReady] = useState(false);
  useEffect(() => {
    if (slides.length && !positionReady) {
      readPosition();
      setPositionReady(true);
    }
  }, [slides.length, positionReady]);
  useEffect(() => {
    const navigation = (event: KeyboardEvent) => {
      if (!acceptsShortcut(event)) return;
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(event.key)) { event.preventDefault(); nextSlide(); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); previousSlide(); }
      if (event.key === "Home") goTo(0);
      if (event.key === "End") goTo(slides.length - 1);
      if (event.key.toLowerCase() === "n") setNotes(value => !value);
      if (event.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", navigation);
    return () => window.removeEventListener("keydown", navigation);
  }, [slides.length]);
  useEffect(() => {
    if (positionReady) history.replaceState(null, "", `#${currentSlide + 1}/${currentStep + 1}`);
  }, [currentSlide, currentStep, positionReady]);
  return <main><div className="stage"><SlideCanvas><DeckRenderer /></SlideCanvas></div>
    <nav aria-label="Presentation controls"><button onClick={previousSlide} aria-label="Previous step">←</button>
      <select aria-label="Slide" value={currentSlide} onChange={event => goTo(Number(event.target.value))}>{slides.map((slide, index) => <option key={index} value={index}>{index + 1}. {String(slide.metadata.title ?? "Untitled")}</option>)}</select>
      <span>{currentStep + 1} / {slides[currentSlide]?.metadata.steps ?? 1}</span>
      <button onClick={nextSlide} aria-label="Next step">→</button><button onClick={() => setNotes(value => !value)}>Notes</button><button onClick={toggleFullscreen}>Fullscreen</button></nav>
    {notes && <aside>{slides[currentSlide]?.notes}</aside>}
    {runtimeErrors.length > 0 && <output role="alert">{runtimeErrors.join("\n")}</output>}
  </main>;
}
(window as any).__legendSlides = { getState: getSlidesState, goTo, next: nextSlide, previous: previousSlide, errors };
createRoot(document.getElementById("root")!).render(<App />);
