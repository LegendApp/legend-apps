import { diffViewerWindowTitle } from "../diffWindowTitle";

describe("diffWindowTitle", () => {
  it("marks windows with unsaved merge drafts", () => {
    expect(diffViewerWindowTitle({
      hasUnsavedMergeDrafts: true,
      source: {
        kind: "folder",
        label: "legend-apps",
        value: "/Users/jay/code/legend-apps",
      },
    })).toBe("legend-apps •");
  });

  it("pads clean source titles to replace the dirty marker", () => {
    expect(diffViewerWindowTitle({
      hasUnsavedMergeDrafts: false,
      source: {
        kind: "folder",
        label: "legend-apps",
        value: "/Users/jay/code/legend-apps",
      },
    })).toBe("legend-apps  ");
  });
});
