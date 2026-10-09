import React, { memo, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useValue } from "@legendapp/state/react";
const { default: Deck, __legendSlidesTemplates, __legendSlidesTransitions } = require("virtual:deck");
const { default: preloadAssets } = require("virtual:preload");
import { DeckRenderer, SlideCanvas } from "../../../apps/slides/src/DeckRenderer";
import { getSlidesState, setSlidesState, slidesState$, nextSlide, previousSlide } from "../../../apps/slides/src/slidesStore";
import { acceptsShortcut, parsePosition } from "./navigation";
import { readNotesVisibility, saveNotesVisibility, SpeakerNotes } from "./notes";
import { startPreloading } from "./preload";

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
const PresentationStage = memo(function PresentationStage() {
  return <div className="stage"><SlideCanvas><DeckRenderer /></SlideCanvas></div>;
});
function App() {
  const currentSlide = useValue(slidesState$.currentSlide);
  const currentStep = useValue(slidesState$.currentStep);
  const slides = useValue(slidesState$.slides);
  const runtimeErrors = useValue(slidesState$.runtimeErrors);
  const [notesVisible, setNotesVisible] = useState(readNotesVisibility);
  const notes = slides[currentSlide]?.notes ?? "";
  const hasNotes = Boolean(notes.trim());
  const toggleNotes = useCallback(() => {
    const next = !notesVisible;
    setNotesVisible(next);
    saveNotesVisibility(next);
  }, [notesVisible]);
  const [positionReady, setPositionReady] = useState(false);
  useEffect(() => {
    if (slides.length && !positionReady) {
      readPosition();
      setPositionReady(true);
    }
  }, [slides.length, positionReady]);
  useEffect(() => {
    if (!positionReady) return;
    const preloader = startPreloading(preloadAssets, getSlidesState().currentSlide);
    (window as any).__legendSlides.preload = preloader.status;
    const unsubscribe = slidesState$.currentSlide.onChange(({ value }) => preloader.prioritize(value));
    return () => { unsubscribe(); preloader.dispose(); };
  }, [positionReady]);
  useEffect(() => {
    const navigation = (event: KeyboardEvent) => {
      if (!acceptsShortcut(event)) return;
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(event.key)) { event.preventDefault(); nextSlide(); }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) { event.preventDefault(); previousSlide(); }
      if (event.key === "Home") goTo(0);
      if (event.key === "End") goTo(slides.length - 1);
      if (event.key.toLowerCase() === "n" && hasNotes) toggleNotes();
      if (event.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", navigation);
    return () => window.removeEventListener("keydown", navigation);
  }, [slides.length, hasNotes, toggleNotes]);
  useEffect(() => {
    if (positionReady) history.replaceState(null, "", `#${currentSlide + 1}/${currentStep + 1}`);
  }, [currentSlide, currentStep, positionReady]);
  return <main><div className="presentation"><PresentationStage />
    {notesVisible && hasNotes && <SpeakerNotes key={currentSlide} notes={notes} currentStep={currentStep} onHide={toggleNotes} />}
    </div>
    <nav aria-label="Presentation controls"><button onClick={previousSlide} aria-label="Previous step">←</button>
      <select aria-label="Slide" value={currentSlide} onChange={event => goTo(Number(event.target.value))}>{slides.map((slide, index) => <option key={index} value={index}>{index + 1}. {String(slide.metadata.title ?? "Untitled")}</option>)}</select>
      <span>{currentStep + 1} / {slides[currentSlide]?.metadata.steps ?? 1}</span>
      <button onClick={nextSlide} aria-label="Next step">→</button>
      {hasNotes && <button aria-controls="speaker-notes" aria-expanded={notesVisible} onClick={toggleNotes}>Notes</button>}
      <button onClick={toggleFullscreen}>Fullscreen</button></nav>
    {runtimeErrors.length > 0 && <output role="alert">{runtimeErrors.join("\n")}</output>}
  </main>;
}
(window as any).__legendSlides = { getState: getSlidesState, goTo, next: nextSlide, previous: previousSlide, errors };
createRoot(document.getElementById("root")!).render(<App />);
