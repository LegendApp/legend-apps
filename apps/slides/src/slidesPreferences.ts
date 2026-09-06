import { createStorage } from "@legend-apps/storage";
import { defaultPresenterLayout, normalizePresenterLayout, type PresenterLayout } from "./presenterLayout";

const slidesStorage = createStorage({ subfolder: "slides" });

type SlidesPreferences = {
  path?: string;
  presenterLayout?: PresenterLayout;
  presentationDisplayId?: string;
};

function readPreferences() {
  return slidesStorage.read<SlidesPreferences>("recent.json", { format: "json" }) ?? {};
}

function updatePreferences(update: Partial<SlidesPreferences>) {
  slidesStorage.write("recent.json", { ...readPreferences(), ...update }, { format: "json" });
}

export function getLastDeckPath() {
  return readPreferences().path;
}

export function rememberDeckPath(path: string) {
  updatePreferences({ path });
}

export function getPresentationDisplayId() {
  return readPreferences().presentationDisplayId;
}

export function rememberPresentationDisplayId(presentationDisplayId: string) {
  updatePreferences({ presentationDisplayId });
}

export function getPresenterLayout() {
  return normalizePresenterLayout(readPreferences().presenterLayout);
}

export function rememberPresenterLayout(presenterLayout: PresenterLayout) {
  updatePreferences({ presenterLayout: normalizePresenterLayout(presenterLayout) });
}

export function resetPresenterLayout() {
  updatePreferences({ presenterLayout: defaultPresenterLayout });
}
