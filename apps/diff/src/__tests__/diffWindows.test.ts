import { getDiffViewerWindowTitleVisibility } from "../diffWindowChrome";

describe("diffWindows", () => {
  it("hides the native title only when the viewer has no source toolbar", () => {
    expect(getDiffViewerWindowTitleVisibility(false)).toBe("hidden");
    expect(getDiffViewerWindowTitleVisibility(undefined)).toBe("hidden");
    expect(getDiffViewerWindowTitleVisibility(true)).toBe("visible");
  });
});
