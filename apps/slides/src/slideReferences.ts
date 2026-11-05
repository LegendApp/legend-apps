import { slidesState$, setSlidesState } from "./slidesStore";

export function slideReferencesVisible(dev: boolean) {
  return slidesState$.slideReferences.get() ?? slidesState$.config.slideReferences.get() ?? (dev && !slidesState$.deckLocked.get());
}

export function toggleSlideReferences() {
  setSlidesState({ slideReferences: !slideReferencesVisible(typeof __DEV__ !== "undefined" && __DEV__) });
}
