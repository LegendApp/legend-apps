import { createObservableSettings } from "@legend-apps/storage";
import { defaultPresenterTextColor, defaultPresenterInactiveColor, normalizePresenterColor } from "./presenterAppearance";

export const defaultPresentationTimerStartsOnSecondSlide = true;
export const defaultRehearsalTimerPausesWhileEditing = true;

function normalizeBoolean(value: unknown, defaultValue: boolean) {
  return typeof value === "boolean" ? value : defaultValue;
}

const slidesSettings = createObservableSettings({
  fields: {
    displayRoleHistory: { defaultValue: {} as import("./displayRoles").DisplayRoleHistory },
    displayRolesConfigured: { defaultValue: false as boolean },
    displayRoles: { defaultValue: { audience: null, notes: null } as import("./displayRoles").DisplayRoles },
    notesPreviewRatio: { defaultValue: 0.34, normalize: (v: unknown) => typeof v === "number" && Number.isFinite(v) ? Math.max(0.2, Math.min(0.65, v)) : 0.34 },
    presentationNotesFontSize: {
      defaultValue: 17,
      normalize: (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(12, Math.min(40, value)) : 17,
    },
    presentationNotesWidth: {
      defaultValue: 800,
      normalize: (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(400, Math.min(2400, value)) : 800,
    },
    presenterTextColor: {
      defaultValue: defaultPresenterTextColor as string,
      normalize: (value: unknown) => normalizePresenterColor(value, defaultPresenterTextColor),
    },
    presenterInactiveColor: {
      defaultValue: defaultPresenterInactiveColor as string,
      normalize: (value: unknown) => normalizePresenterColor(value, defaultPresenterInactiveColor),
    },
    backgroundIntensity: {
      defaultValue: 1,
      normalize: (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(6, value)) : 1,
    },
    titleAnimationSpeed: {
      defaultValue: 1,
      normalize: (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0.25, Math.min(3, value)) : 1,
    },
    presentationTimerStartsOnSecondSlide: {
      defaultValue: defaultPresentationTimerStartsOnSecondSlide,
      normalize: (value) => normalizeBoolean(value, defaultPresentationTimerStartsOnSecondSlide),
    },
    compilerRuntimePath: {
      defaultValue: "" as string,
      normalize: (value: unknown) => typeof value === "string" && value.startsWith("/") ? value : "",
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

const backgroundIntensitySetting = slidesSettings.field("backgroundIntensity");
export const useBackgroundIntensitySetting = backgroundIntensitySetting.use;
export const setBackgroundIntensitySetting = backgroundIntensitySetting.set;

const presentationNotesWidthSetting = slidesSettings.field("presentationNotesWidth");
export const usePresentationNotesWidthSetting = presentationNotesWidthSetting.use;
export const setPresentationNotesWidthSetting = presentationNotesWidthSetting.set;

export const displayRolesSetting = slidesSettings.field("displayRoles");
export const notesPreviewRatioSetting = slidesSettings.field("notesPreviewRatio");

export const displayRolesConfiguredSetting = slidesSettings.field("displayRolesConfigured");

export const useDisplayRolesSetting = displayRolesSetting.use;
export const useNotesPreviewRatioSetting = notesPreviewRatioSetting.use;

const presentationNotesFontSizeSetting = slidesSettings.field("presentationNotesFontSize");
export const usePresentationNotesFontSizeSetting = presentationNotesFontSizeSetting.use;
export const setPresentationNotesFontSizeSetting = presentationNotesFontSizeSetting.set;

const presenterTextColorSetting = slidesSettings.field("presenterTextColor");
export const usePresenterTextColorSetting = presenterTextColorSetting.use;
export const setPresenterTextColorSetting = presenterTextColorSetting.set;

const presenterInactiveColorSetting = slidesSettings.field("presenterInactiveColor");
export const usePresenterInactiveColorSetting = presenterInactiveColorSetting.use;
export const setPresenterInactiveColorSetting = presenterInactiveColorSetting.set;

export const displayRoleHistorySetting = slidesSettings.field("displayRoleHistory");

export const titleAnimationSpeedSetting = slidesSettings.field("titleAnimationSpeed");
export const useTitleAnimationSpeedSetting = titleAnimationSpeedSetting.use;
export const setTitleAnimationSpeedSetting = titleAnimationSpeedSetting.set;

const compilerRuntimePathSetting = slidesSettings.field("compilerRuntimePath");

/** Explicit bun or node executable chosen in Settings; empty means automatic discovery. */
export function getCompilerRuntimePathSetting() {
  return compilerRuntimePathSetting.get();
}

export function setCompilerRuntimePathSetting(path: string) {
  compilerRuntimePathSetting.set(path);
}

export function useCompilerRuntimePathSetting() {
  return compilerRuntimePathSetting.use();
}
