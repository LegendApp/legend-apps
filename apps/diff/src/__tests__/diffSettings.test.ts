import {
  defaultDiffFontFamily,
  defaultDiffFontSize,
  defaultDiffAdaptiveLightModeEnabled,
  defaultDiffSidebarWidth,
  defaultDiffShowOnlyHunks,
  defaultDiffSyntaxHighlightingEnabled,
  defaultDiffViewMode,
  getDiffAdaptiveLightModeEnabledSetting,
  getDiffFontFamilySetting,
  getDiffFontSizeSetting,
  getDiffShowOnlyHunksSetting,
  getDiffSidebarWidthSetting,
  getDiffSyntaxHighlightingEnabledSetting,
  getDiffSyntaxTheme,
  getDiffSyntaxThemeSetting,
  getDiffViewModeSetting,
  isDiffViewMode,
  setDiffAdaptiveLightModeEnabledSetting,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffShowOnlyHunksSetting,
  setDiffSidebarWidthSetting,
  setDiffSyntaxHighlightingEnabledSetting,
  setDiffSyntaxThemeSetting,
  setDiffViewModeSetting,
} from "../diffSettings";

describe("diffSettings", () => {
  it("uses stable defaults", () => {
    expect(getDiffFontFamilySetting()).toBe(defaultDiffFontFamily);
    expect(getDiffFontSizeSetting()).toBe(defaultDiffFontSize);
    expect(getDiffViewModeSetting()).toBe(defaultDiffViewMode);
    expect(getDiffShowOnlyHunksSetting()).toBe(defaultDiffShowOnlyHunks);
    expect(getDiffSidebarWidthSetting()).toBe(defaultDiffSidebarWidth);
    expect(getDiffAdaptiveLightModeEnabledSetting()).toBe(defaultDiffAdaptiveLightModeEnabled);
    expect(getDiffSyntaxThemeSetting()).toBe("dark-plus");
    expect(getDiffSyntaxTheme().name).toBe("dark-plus");
    expect(getDiffSyntaxHighlightingEnabledSetting()).toBe(defaultDiffSyntaxHighlightingEnabled);
  });

  it("accepts only known view modes", () => {
    expect(isDiffViewMode("unified")).toBe(true);
    expect(isDiffViewMode("blocks")).toBe(true);
    expect(isDiffViewMode("merge")).toBe(false);
    expect(isDiffViewMode("side-by-side")).toBe(false);
  });

  it("normalizes setting updates through the configured fields", () => {
    setDiffFontFamilySetting("SF Mono");
    setDiffFontSizeSetting(14);
    setDiffSyntaxThemeSetting("github-light");
    setDiffViewModeSetting("blocks");
    setDiffShowOnlyHunksSetting(false);
    setDiffSidebarWidthSetting(320);
    setDiffAdaptiveLightModeEnabledSetting(false);
    setDiffSyntaxHighlightingEnabledSetting(false);

    expect(getDiffFontFamilySetting()).toBe("SF Mono");
    expect(getDiffFontSizeSetting()).toBe(14);
    expect(getDiffSyntaxThemeSetting()).toBe("github-light");
    expect(getDiffSyntaxTheme().appearance).toBe("light");
    expect(getDiffViewModeSetting()).toBe("blocks");
    expect(getDiffShowOnlyHunksSetting()).toBe(false);
    expect(getDiffSidebarWidthSetting()).toBe(320);
    expect(getDiffAdaptiveLightModeEnabledSetting()).toBe(false);
    expect(getDiffSyntaxHighlightingEnabledSetting()).toBe(false);
  });

  it("falls back when invalid values are written through the settings API", () => {
    setDiffFontFamilySetting("Papyrus" as never);
    setDiffFontSizeSetting(100);
    setDiffSyntaxThemeSetting("not-installed");
    setDiffViewModeSetting("merge" as never);
    setDiffShowOnlyHunksSetting("yes" as never);
    setDiffSidebarWidthSetting(20);
    setDiffAdaptiveLightModeEnabledSetting("yes" as never);
    setDiffSyntaxHighlightingEnabledSetting("yes" as never);

    expect(getDiffFontFamilySetting()).toBe(defaultDiffFontFamily);
    expect(getDiffFontSizeSetting()).toBe(defaultDiffFontSize);
    expect(getDiffSyntaxThemeSetting()).toBe("dark-plus");
    expect(getDiffViewModeSetting()).toBe(defaultDiffViewMode);
    expect(getDiffShowOnlyHunksSetting()).toBe(defaultDiffShowOnlyHunks);
    expect(getDiffSidebarWidthSetting()).toBe(defaultDiffSidebarWidth);
    expect(getDiffAdaptiveLightModeEnabledSetting()).toBe(defaultDiffAdaptiveLightModeEnabled);
    expect(getDiffSyntaxHighlightingEnabledSetting()).toBe(defaultDiffSyntaxHighlightingEnabled);
  });
});
