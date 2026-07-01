import { ThemeSelectorSection } from "@legend-desktop/appearance-settings";
import { SegmentedOptions } from "@legend-desktop/design-system";
import { getLegendDisplayThemeFiles, getMarkdownLayoutThemeFiles } from "@legend-desktop/theme";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from "@legend-desktop/settings-window";
import { useMemo } from "react";
import {
  setMarkdownContentWidthSetting,
  setMarkdownDocumentDensitySetting,
  setMarkdownDisplayThemeSetting,
  setMarkdownFontFamilySetting,
  setMarkdownFontSizeSetting,
  setMarkdownLayoutThemeSetting,
  setMarkdownLineHeightSetting,
  type MarkdownContentWidthSetting,
  type MarkdownDocumentDensitySetting,
  type MarkdownFontFamilySetting,
  type MarkdownFontSizeSetting,
  type MarkdownLineHeightSetting,
  useMarkdownContentWidthSetting,
  useMarkdownDocumentDensitySetting,
  useMarkdownDisplayThemeSetting,
  useMarkdownFontFamilySetting,
  useMarkdownFontSizeSetting,
  useMarkdownLayoutThemeSetting,
  useMarkdownLineHeightSetting,
} from "../markdownSettings";
import { loadMarkdownUserThemesSync } from "../userThemes";

const fontFamilyOptions = [
  { label: "Theme", value: "system" },
  { label: "Serif", value: "serif" },
  { label: "Mono", value: "mono" },
] as const satisfies readonly { label: string; value: MarkdownFontFamilySetting }[];

const fontSizeOptions = [
  { label: "Small", value: "small" },
  { label: "Default", value: "default" },
  { label: "Large", value: "large" },
  { label: "XL", value: "xlarge" },
] as const satisfies readonly { label: string; value: MarkdownFontSizeSetting }[];

const lineHeightOptions = [
  { label: "Compact", value: "compact" },
  { label: "Normal", value: "normal" },
  { label: "Relaxed", value: "relaxed" },
] as const satisfies readonly { label: string; value: MarkdownLineHeightSetting }[];

const contentWidthOptions = [
  { label: "Narrow", value: "narrow" },
  { label: "Standard", value: "standard" },
  { label: "Wide", value: "wide" },
  { label: "Full", value: "full" },
] as const satisfies readonly { label: string; value: MarkdownContentWidthSetting }[];

const densityOptions = [
  { label: "Compact", value: "compact" },
  { label: "Comfortable", value: "comfortable" },
  { label: "Spacious", value: "spacious" },
] as const satisfies readonly { label: string; value: MarkdownDocumentDensitySetting }[];

function formatThemeLabel(name: string) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AppearanceSettingsPage() {
  return (
    <SettingsPage>
      <AppearanceSettingsContent />
    </SettingsPage>
  );
}

export function AppearanceSettingsContent() {
  const userThemeLoadResult = useMemo(() => loadMarkdownUserThemesSync({ force: true }), []);
  const displayThemeOptions = useMemo(
    () => getLegendDisplayThemeFiles().map((theme) => ({ label: formatThemeLabel(theme.name), value: theme.name })),
    [userThemeLoadResult],
  );
  const layoutThemeOptions = useMemo(
    () => getMarkdownLayoutThemeFiles().map((theme) => ({ label: formatThemeLabel(theme.name), value: theme.name })),
    [userThemeLoadResult],
  );
  const selectedDisplayTheme = useMarkdownDisplayThemeSetting();
  const selectedLayoutTheme = useMarkdownLayoutThemeSetting();
  const selectedFontFamily = useMarkdownFontFamilySetting();
  const selectedFontSize = useMarkdownFontSizeSetting();
  const selectedLineHeight = useMarkdownLineHeightSetting();
  const selectedContentWidth = useMarkdownContentWidthSetting();
  const selectedDensity = useMarkdownDocumentDensitySetting();

  return (
    <>
      <ThemeSelectorSection
        first
        issues={userThemeLoadResult.displayThemes.issues}
        onThemeChange={setMarkdownDisplayThemeSetting}
        selectedTheme={selectedDisplayTheme}
        themes={displayThemeOptions}
        title="Display Theme"
      />
      <ThemeSelectorSection
        issues={userThemeLoadResult.layoutThemes.issues}
        onThemeChange={setMarkdownLayoutThemeSetting}
        selectedTheme={selectedLayoutTheme}
        themes={layoutThemeOptions}
        title="Layout Theme"
      />
      <SettingsSection
        title="Document"
      >
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setMarkdownFontFamilySetting}
              options={fontFamilyOptions}
              value={selectedFontFamily}
            />
          )}
          description="Use the theme typeface, a serif reading face, or a fixed-width face."
          title="Font"
        />
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setMarkdownFontSizeSetting}
              options={fontSizeOptions}
              value={selectedFontSize}
            />
          )}
          description="Adjust the base text size for the editor."
          title="Font Size"
        />
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setMarkdownLineHeightSetting}
              options={lineHeightOptions}
              value={selectedLineHeight}
            />
          )}
          description="Change vertical rhythm for dense editing or slower reading."
          title="Line Height"
        />
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setMarkdownContentWidthSetting}
              options={contentWidthOptions}
              value={selectedContentWidth}
            />
          )}
          description="Set the maximum width used by the document body."
          title="Maximum Width"
        />
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setMarkdownDocumentDensitySetting}
              options={densityOptions}
              value={selectedDensity}
            />
          )}
          description="Control the outer padding and spacing between blocks."
          title="Density"
        />
      </SettingsSection>
    </>
  );
}
