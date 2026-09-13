import { createObservableSettings, getPersistPlugin, type Storage } from "@legend-apps/storage";
import { defaultPresenterLayout, normalizePresenterLayout, type PresenterLayout } from "./presenterLayout";

export function createSlidesPreferences(storage?: Storage) {
  const preferences = createObservableSettings({
    fields: {
      path: { defaultValue: undefined as string | undefined },
      presentationDisplayId: { defaultValue: undefined as string | undefined },
      presenterLayout: { defaultValue: { ...defaultPresenterLayout }, normalize: normalizePresenterLayout },
    },
    filename: "recent",
    subfolder: "slides",
    saveTimeout: 0,
    storage,
  });
  const path = preferences.field("path");
  const display = preferences.field("presentationDisplayId");
  const layout = preferences.field("presenterLayout");
  // Keep these command-triggered writes unbuffered, including writes queued by hydration.
  const flush = () => getPersistPlugin(preferences.settings$)?.flush();
  return {
    getLastDeckPath: path.get,
    getPresentationDisplayId: display.get,
    getPresenterLayout: layout.get,
    rememberDeckPath(value: string) { path.set(value); void flush(); },
    rememberPresentationDisplayId(value: string) { display.set(value); void flush(); },
    rememberPresenterLayout(value: PresenterLayout) { layout.set(value); void flush(); },
    resetPresenterLayout() { layout.set(defaultPresenterLayout); void flush(); },
    flush,
  };
}

export const {
  getLastDeckPath,
  getPresentationDisplayId,
  getPresenterLayout,
  rememberDeckPath,
  rememberPresentationDisplayId,
  rememberPresenterLayout,
  resetPresenterLayout,
} = createSlidesPreferences();
