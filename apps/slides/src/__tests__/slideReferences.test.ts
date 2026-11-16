import "./nativeMock";
import { expect, test } from "bun:test";
import { getSlidesState, setSlidesState } from "../slidesStore";
import { slideReferencesVisible, toggleSlideReferences } from "../slideReferences";

const testGlobals = globalThis as typeof globalThis & { __DEV__?: boolean };

test("development defaults follow presentation mode; explicit choices win", () => {
  const initial = getSlidesState();
  const previousDev = testGlobals.__DEV__;
  testGlobals.__DEV__ = true;
  try {
    setSlidesState({ slideReferences: undefined, config: {}, deckLocked: false });
    expect(slideReferencesVisible(true)).toBe(true);
    expect(slideReferencesVisible(false)).toBe(false);
    setSlidesState({ deckLocked: true });
    expect(slideReferencesVisible(true)).toBe(false);
    setSlidesState({ config: { slideReferences: true } });
    expect(slideReferencesVisible(true)).toBe(true);
    setSlidesState({ config: { slideReferences: false }, deckLocked: false });
    expect(slideReferencesVisible(true)).toBe(false);
    toggleSlideReferences();
    expect(slideReferencesVisible(true)).toBe(true);
    toggleSlideReferences();
    expect(slideReferencesVisible(true)).toBe(false);
    setSlidesState({ config: { slideReferences: true }, slideReferences: false });
    expect(slideReferencesVisible(true)).toBe(false);
  } finally { testGlobals.__DEV__ = previousDev; setSlidesState(initial); }
});

test("release references stay disabled for frontmatter, explicit state and the I-key toggle", () => {
  const initial = getSlidesState();
  const previousDev = testGlobals.__DEV__;
  testGlobals.__DEV__ = false;
  try {
    for (const slideReferences of [undefined, false, true]) {
      setSlidesState({ slideReferences, config: { slideReferences: true }, deckLocked: false });
      expect(slideReferencesVisible(false)).toBe(false);
      toggleSlideReferences();
      expect(getSlidesState().slideReferences).toBe(slideReferences);
      expect(slideReferencesVisible(false)).toBe(false);
    }
  } finally { testGlobals.__DEV__ = previousDev; setSlidesState(initial); }
});
