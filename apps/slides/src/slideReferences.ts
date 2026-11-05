import { slidesState$, setSlidesState } from "./slidesStore";

export function slideReferencesVisible(dev: boolean) {
  return dev && (slidesState$.slideReferences.get() ?? slidesState$.config.slideReferences.get() ?? !slidesState$.deckLocked.get());
}

export function toggleSlideReferences() {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  setSlidesState({ slideReferences: !slideReferencesVisible(__DEV__) });
}
