import { createObservableSettings } from "@legend-apps/storage";

export const defaultPresentationTimerStartsOnSecondSlide = true;
export const defaultRehearsalTimerPausesWhileEditing = true;

function normalizeBoolean(value: unknown, defaultValue: boolean) {
  return typeof value === "boolean" ? value : defaultValue;
}

const slidesSettings = createObservableSettings({
  fields: {
    presentationTimerStartsOnSecondSlide: {
      defaultValue: defaultPresentationTimerStartsOnSecondSlide,
      normalize: (value) => normalizeBoolean(value, defaultPresentationTimerStartsOnSecondSlide),
    },
    rehearsalTimerPausesWhileEditing: {
      defaultValue: defaultRehearsalTimerPausesWhileEditing,
      normalize: (value) => normalizeBoolean(value, defaultRehearsalTimerPausesWhileEditing),
    },
  },
  filename: "settings",
  subfolder: "slides",
});

const presentationTimerStartsOnSecondSlideSetting = slidesSettings.field("presentationTimerStartsOnSecondSlide");
const rehearsalTimerPausesWhileEditingSetting = slidesSettings.field("rehearsalTimerPausesWhileEditing");

export function getPresentationTimerStartsOnSecondSlideSetting() {
  return presentationTimerStartsOnSecondSlideSetting.get();
}

export function setPresentationTimerStartsOnSecondSlideSetting(enabled: boolean) {
  presentationTimerStartsOnSecondSlideSetting.set(enabled);
}

export function usePresentationTimerStartsOnSecondSlideSetting() {
  return presentationTimerStartsOnSecondSlideSetting.use();
}

export function getRehearsalTimerPausesWhileEditingSetting() {
  return rehearsalTimerPausesWhileEditingSetting.get();
}

export function setRehearsalTimerPausesWhileEditingSetting(enabled: boolean) {
  rehearsalTimerPausesWhileEditingSetting.set(enabled);
}

export function useRehearsalTimerPausesWhileEditingSetting() {
  return rehearsalTimerPausesWhileEditingSetting.use();
}
