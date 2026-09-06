export type PresenterLayout = {
  currentPreviewRatio: number;
  notesRatio: number;
};

export const defaultPresenterLayout: PresenterLayout = {
  currentPreviewRatio: 2 / 3,
  notesRatio: 0.26,
};

const currentPreviewRange = { maximum: 0.8, minimum: 0.35 };
const notesRange = { maximum: 0.55, minimum: 0.15 };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizePresenterLayout(value: unknown): PresenterLayout {
  const layout = value && typeof value === "object" ? value as Partial<PresenterLayout> : {};
  return {
    currentPreviewRatio: clamp(
      finiteNumber(layout.currentPreviewRatio, defaultPresenterLayout.currentPreviewRatio),
      currentPreviewRange.minimum,
      currentPreviewRange.maximum,
    ),
    notesRatio: clamp(
      finiteNumber(layout.notesRatio, defaultPresenterLayout.notesRatio),
      notesRange.minimum,
      notesRange.maximum,
    ),
  };
}

export function resizePresenterLayout(
  layout: PresenterLayout,
  divider: "previews" | "notes",
  delta: number,
  availableSize: number,
): PresenterLayout {
  if (!Number.isFinite(delta) || !Number.isFinite(availableSize) || availableSize <= 0) {
    return layout;
  }
  const resized = normalizePresenterLayout(divider === "previews"
    ? { ...layout, currentPreviewRatio: layout.currentPreviewRatio + delta / availableSize }
    : { ...layout, notesRatio: layout.notesRatio - delta / availableSize });
  return resized.currentPreviewRatio === layout.currentPreviewRatio && resized.notesRatio === layout.notesRatio
    ? layout
    : resized;
}
