import {
  defaultDiffFontFamily,
  defaultDiffFontSize,
  defaultDiffViewMode,
  getDiffFontFamilySetting,
  getDiffFontSizeSetting,
  getDiffSyntaxTheme,
  getDiffSyntaxThemeSetting,
  getDiffViewModeSetting,
  isDiffViewMode,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffSyntaxThemeSetting,
  setDiffViewModeSetting,
} from "../diffSettings";

describe("diffSettings", () => {
  it("uses stable defaults", () => {
    expect(getDiffFontFamilySetting()).toBe(defaultDiffFontFamily);
    expect(getDiffFontSizeSetting()).toBe(defaultDiffFontSize);
    expect(getDiffViewModeSetting()).toBe(defaultDiffViewMode);
    expect(getDiffSyntaxThemeSetting()).toBe("dark-plus");
    expect(getDiffSyntaxTheme().name).toBe("dark-plus");
  });

  it("accepts only known view modes", () => {
    expect(isDiffViewMode("unified")).toBe(true);
    expect(isDiffViewMode("blocks")).toBe(true);
    expect(isDiffViewMode("side-by-side")).toBe(false);
  });

  it("normalizes setting updates through the configured fields", () => {
    setDiffFontFamilySetting("SF Mono");
    setDiffFontSizeSetting(14);
    setDiffSyntaxThemeSetting("github-light");
    setDiffViewModeSetting("blocks");

    expect(getDiffFontFamilySetting()).toBe("SF Mono");
    expect(getDiffFontSizeSetting()).toBe(14);
    expect(getDiffSyntaxThemeSetting()).toBe("github-light");
    expect(getDiffSyntaxTheme().appearance).toBe("light");
    expect(getDiffViewModeSetting()).toBe("blocks");
  });

  it("falls back when invalid values are written through the settings API", () => {
    setDiffFontFamilySetting("Papyrus" as never);
    setDiffFontSizeSetting(100);
    setDiffSyntaxThemeSetting("not-installed");
    setDiffViewModeSetting("side-by-side" as never);

    expect(getDiffFontFamilySetting()).toBe(defaultDiffFontFamily);
    expect(getDiffFontSizeSetting()).toBe(defaultDiffFontSize);
    expect(getDiffSyntaxThemeSetting()).toBe("dark-plus");
    expect(getDiffViewModeSetting()).toBe(defaultDiffViewMode);
  });
});
