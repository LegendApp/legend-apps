import { useLayoutEffect, useRef } from "react";
import { speakerNoteOpacity, splitSpeakerNoteSteps } from "../../../apps/slides/src/speakerNoteSteps";

export const notesVisibilityKey = "legend-slides:notes-visible";

export function readNotesVisibility() {
  try { return localStorage.getItem(notesVisibilityKey) !== "false"; }
  catch { return true; }
}

export function saveNotesVisibility(visible: boolean) {
  try { localStorage.setItem(notesVisibilityKey, String(visible)); }
  catch { /* The sidebar still works when browser storage is unavailable. */ }
}

export function SpeakerNotes({ notes, currentStep, onHide }: { notes: string; currentStep: number; onHide: () => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const sections = splitSpeakerNoteSteps(notes);
  useLayoutEffect(() => {
    const container = scroll.current!;
    const alignStep = () => {
      const active = container.querySelector<HTMLElement>(`[data-step="${currentStep}"]`);
      if (active) {
        const top = active.offsetTop - (container.clientHeight - Math.min(active.offsetHeight, container.clientHeight)) / 2;
        container.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      }
    };
    alignStep();
    const resize = new ResizeObserver(alignStep);
    resize.observe(container);
    return () => resize.disconnect();
  }, [notes, currentStep]);
  return <aside id="speaker-notes" className="notes-sidebar" aria-label="Speaker notes">
    <header><h2>Speaker notes</h2><button aria-label="Hide speaker notes" onClick={onHide}>×</button></header>
    <div className="notes-scroll" ref={scroll} tabIndex={0}>
      {sections.map((section, index) => <section key={index} className="note-section" data-step={section.step}
        aria-current={section.step === currentStep ? "step" : undefined} style={{ opacity: speakerNoteOpacity(section, currentStep) }}>
        {section.markdown}
      </section>)}
    </div>
  </aside>;
}
