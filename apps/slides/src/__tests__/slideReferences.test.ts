import "./nativeMock";
import { expect, test } from "bun:test";
import { getSlidesState, setSlidesState } from "../slidesStore";
import { slideReferencesVisible, toggleSlideReferences } from "../slideReferences";

test("defaults follow development and presentation mode; explicit choices win", () => {
  const initial = getSlidesState();
  try {
    setSlidesState({ slideReferences: undefined, config: {}, deckLocked: false });
    expect(slideReferencesVisible(true)).toBe(true);
    expect(slideReferencesVisible(false)).toBe(false);
    setSlidesState({ deckLocked: true });
    expect(slideReferencesVisible(true)).toBe(false);
    setSlidesState({ config: { slideReferences: true } });
    expect(slideReferencesVisible(false)).toBe(true);
    setSlidesState({ config: { slideReferences: false }, deckLocked: false });
    expect(slideReferencesVisible(true)).toBe(false);
    toggleSlideReferences();
    expect(slideReferencesVisible(false)).toBe(true);
    toggleSlideReferences();
    expect(slideReferencesVisible(true)).toBe(false);
  } finally { setSlidesState(initial); }
});
