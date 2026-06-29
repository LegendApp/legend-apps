import {
  defaultDiffFontFamily,
  defaultDiffFontSize,
  defaultDiffAdaptiveLightModeEnabled,
  defaultDiffShowOnlyHunks,
  defaultDiffSyntaxHighlightingEnabled,
  defaultDiffSyntaxPrewarmEnabled,
  defaultDiffViewMode,
  getDiffAdaptiveLightModeEnabledSetting,
  getDiffFontFamilySetting,
  getDiffFontSizeSetting,
  getDiffShowOnlyHunksSetting,
  getDiffSyntaxHighlightingEnabledSetting,
  getDiffSyntaxPrewarmKnownLanguagesSetting,
  getDiffSyntaxPrewarmLanguagesSetting,
  getDiffSyntaxPrewarmEnabledSetting,
  getDiffSyntaxTheme,
  getDiffSyntaxThemeSetting,
  getDiffViewModeSetting,
  isDiffViewMode,
  setDiffAdaptiveLightModeEnabledSetting,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffShowOnlyHunksSetting,
  setDiffSyntaxHighlightingEnabledSetting,
  setDiffSyntaxPrewarmEnabledSetting,
  setDiffSyntaxPrewarmKnownLanguagesSetting,
  setDiffSyntaxPrewarmLanguagesSetting,
  setDiffSyntaxThemeSetting,
  setDiffViewModeSetting,
} from "../diffSettings";

describe("diffSettings", () => {
  it("uses stable defaults", () => {
    expect(getDiffFontFamilySetting()).toBe(defaultDiffFontFamily);
    expect(getDiffFontSizeSetting()).toBe(defaultDiffFontSize);
    expect(getDiffViewModeSetting()).toBe(defaultDiffViewMode);
    expect(getDiffShowOnlyHunksSetting()).toBe(defaultDiffShowOnlyHunks);
    expect(getDiffAdaptiveLightModeEnabledSetting()).toBe(defaultDiffAdaptiveLightModeEnabled);
    expect(getDiffSyntaxThemeSetting()).toBe("dark-plus");
    expect(getDiffSyntaxTheme().name).toBe("dark-plus");
    expect(getDiffSyntaxHighlightingEnabledSetting()).toBe(defaultDiffSyntaxHighlightingEnabled);
    expect(getDiffSyntaxPrewarmEnabledSetting()).toBe(defaultDiffSyntaxPrewarmEnabled);
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
    setDiffAdaptiveLightModeEnabledSetting(false);
    setDiffSyntaxHighlightingEnabledSetting(false);
    setDiffSyntaxPrewarmEnabledSetting(false);
    setDiffSyntaxPrewarmKnownLanguagesSetting(["tsx", "typescript", "tsx"]);
    setDiffSyntaxPrewarmLanguagesSetting(["tsx", "json"]);

    expect(getDiffFontFamilySetting()).toBe("SF Mono");
    expect(getDiffFontSizeSetting()).toBe(14);
    expect(getDiffSyntaxThemeSetting()).toBe("github-light");
    expect(getDiffSyntaxTheme().appearance).toBe("light");
    expect(getDiffViewModeSetting()).toBe("blocks");
    expect(getDiffShowOnlyHunksSetting()).toBe(false);
    expect(getDiffAdaptiveLightModeEnabledSetting()).toBe(false);
    expect(getDiffSyntaxHighlightingEnabledSetting()).toBe(false);
    expect(getDiffSyntaxPrewarmEnabledSetting()).toBe(false);
    expect(getDiffSyntaxPrewarmKnownLanguagesSetting()).toEqual(["tsx", "typescript"]);
    expect(getDiffSyntaxPrewarmLanguagesSetting()).toEqual(["json", "tsx"]);
  });

  it("falls back when invalid values are written through the settings API", () => {
    setDiffFontFamilySetting("Papyrus" as never);
    setDiffFontSizeSetting(100);
    setDiffSyntaxThemeSetting("not-installed");
    setDiffViewModeSetting("merge" as never);
    setDiffShowOnlyHunksSetting("yes" as never);
    setDiffAdaptiveLightModeEnabledSetting("yes" as never);
    setDiffSyntaxHighlightingEnabledSetting("yes" as never);
    setDiffSyntaxPrewarmEnabledSetting("yes" as never);
    setDiffSyntaxPrewarmKnownLanguagesSetting(["tsx", "", "tsx", 1] as never);
    setDiffSyntaxPrewarmLanguagesSetting("tsx" as never);

    expect(getDiffFontFamilySetting()).toBe(defaultDiffFontFamily);
    expect(getDiffFontSizeSetting()).toBe(defaultDiffFontSize);
    expect(getDiffSyntaxThemeSetting()).toBe("dark-plus");
    expect(getDiffViewModeSetting()).toBe(defaultDiffViewMode);
    expect(getDiffShowOnlyHunksSetting()).toBe(defaultDiffShowOnlyHunks);
    expect(getDiffAdaptiveLightModeEnabledSetting()).toBe(defaultDiffAdaptiveLightModeEnabled);
    expect(getDiffSyntaxHighlightingEnabledSetting()).toBe(defaultDiffSyntaxHighlightingEnabled);
    expect(getDiffSyntaxPrewarmEnabledSetting()).toBe(defaultDiffSyntaxPrewarmEnabled);
    expect(getDiffSyntaxPrewarmKnownLanguagesSetting()).toEqual(["tsx"]);
    expect(getDiffSyntaxPrewarmLanguagesSetting()).toEqual([]);
  });
});
