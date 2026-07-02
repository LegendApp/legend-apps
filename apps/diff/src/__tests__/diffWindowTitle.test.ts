import { diffViewerWindowTitle } from "../diffWindowTitle";

describe("diffWindowTitle", () => {
  it("marks windows with unsaved merge drafts", () => {
    expect(diffViewerWindowTitle({
      hasUnsavedMergeDrafts: true,
      source: {
        kind: "folder",
        label: "legend-desktop",
        value: "/Users/jay/code/legend-desktop",
      },
    })).toBe("legend-desktop •");
  });

  it("pads clean source titles to replace the dirty marker", () => {
    expect(diffViewerWindowTitle({
      hasUnsavedMergeDrafts: false,
      source: {
        kind: "folder",
        label: "legend-desktop",
        value: "/Users/jay/code/legend-desktop",
      },
    })).toBe("legend-desktop  ");
  });
});
