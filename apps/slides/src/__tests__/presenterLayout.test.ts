import {
  defaultPresenterLayout,
  normalizePresenterLayout,
  resizePresenterLayout,
} from "../presenterLayout";

describe("presenter layout", () => {
  it("uses defaults for missing or invalid persisted values", () => {
    expect(normalizePresenterLayout(undefined)).toEqual(defaultPresenterLayout);
    expect(normalizePresenterLayout({ currentPreviewRatio: Number.NaN, notesRatio: "large" })).toEqual(defaultPresenterLayout);
  });

  it("clamps persisted ratios to usable pane sizes", () => {
    expect(normalizePresenterLayout({ currentPreviewRatio: 1, notesRatio: 0 })).toEqual({
      currentPreviewRatio: 0.8,
      notesRatio: 0.15,
    });
    expect(normalizePresenterLayout({ currentPreviewRatio: 0, notesRatio: 1 })).toEqual({
      currentPreviewRatio: 0.35,
      notesRatio: 0.55,
    });
  });

  it("resizes the adjacent preview panes", () => {
    expect(resizePresenterLayout(defaultPresenterLayout, "previews", 100, 1000).currentPreviewRatio).toBeCloseTo(0.7667, 3);
  });

  it("resizes notes in the opposite direction of the vertical divider", () => {
    expect(resizePresenterLayout(defaultPresenterLayout, "notes", 50, 500).notesRatio).toBeCloseTo(0.16, 3);
  });

  it("ignores resize events before the workspace is measured", () => {
    expect(resizePresenterLayout(defaultPresenterLayout, "previews", 20, 0)).toBe(defaultPresenterLayout);
  });

  it("preserves identity when a divider is already at its limit", () => {
    const layout = { currentPreviewRatio: 0.8, notesRatio: 0.15 };
    expect(resizePresenterLayout(layout, "previews", 20, 1000)).toBe(layout);
    expect(resizePresenterLayout(layout, "notes", 20, 1000)).toBe(layout);
  });
});
