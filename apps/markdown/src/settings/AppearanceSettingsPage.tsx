import { ChromeSettingsSection } from "@legend-apps/appearance-settings";
import { getLegendDisplayThemeFiles, getMarkdownLayoutThemeFiles } from "@legend-apps/theme";
import {
  SettingsSection,
  SettingsSelectRow,
  SettingsSegmentedRow,
} from "@legendapp/spark/ui/settings";
import { useMemo } from "react";
import { Text, View } from "react-native";
import {
  setMarkdownChromeTheme,
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
  useMarkdownChromeTheme,
  useMarkdownContentWidthSetting,
  useMarkdownDocumentDensitySetting,
  useMarkdownDisplayThemeSetting,
  useMarkdownFontFamilySetting,
  useMarkdownFontSizeSetting,
  useMarkdownLayoutThemeSetting,
  useMarkdownLineHeightSetting,
} from "../markdownSettings";
import { loadMarkdownUserThemesSync } from "../userThemes";
import { contentWidthOptions, densityOptions, fontFamilyOptions, fontSizeOptions, lineHeightOptions } from "./settingOptions";

function formatThemeLabel(name: string) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSelectedThemeValue(options: readonly { value: string }[], selectedTheme: string) {
  return options.some((theme) => theme.value === selectedTheme)
    ? selectedTheme
    : options[0]?.value ?? selectedTheme;
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
  const chrome = useMarkdownChromeTheme();

  return (
    <>
      <SettingsSection>
        <SettingsSelectRow
          label="Display Theme"
          options={displayThemeOptions}
          value={getSelectedThemeValue(displayThemeOptions, selectedDisplayTheme)}
          onValueChange={setMarkdownDisplayThemeSetting}
        />
        {userThemeLoadResult.displayThemes.issues.length > 0 ? (
          <ThemeIssueMessages issues={userThemeLoadResult.displayThemes.issues} />
        ) : null}
        <SettingsSelectRow
          label="Layout Theme"
          options={layoutThemeOptions}
          value={getSelectedThemeValue(layoutThemeOptions, selectedLayoutTheme)}
          onValueChange={setMarkdownLayoutThemeSetting}
        />
        {userThemeLoadResult.layoutThemes.issues.length > 0 ? (
          <ThemeIssueMessages issues={userThemeLoadResult.layoutThemes.issues} />
        ) : null}
      </SettingsSection>
      <ChromeSettingsSection chrome={chrome} onChromeChange={setMarkdownChromeTheme} />
      <SettingsSection title="Document">
        <SettingsSegmentedRow
          description="Use the theme typeface, a serif reading face, or a fixed-width face."
          label="Font"
          options={fontFamilyOptions}
          value={selectedFontFamily}
          onValueChange={value => setMarkdownFontFamilySetting(value as MarkdownFontFamilySetting)}
        />
        <SettingsSelectRow
          description="Adjust the base text size for the editor."
          label="Font Size"
          options={fontSizeOptions}
          value={selectedFontSize}
          onValueChange={value => setMarkdownFontSizeSetting(value as MarkdownFontSizeSetting)}
        />
        <SettingsSelectRow
          description="Change vertical rhythm for dense editing or slower reading."
          label="Line Height"
          options={lineHeightOptions}
          value={selectedLineHeight}
          onValueChange={value => setMarkdownLineHeightSetting(value as MarkdownLineHeightSetting)}
        />
        <SettingsSelectRow
          description="Set the maximum width used by the document body."
          label="Maximum Width"
          options={contentWidthOptions}
          value={selectedContentWidth}
          onValueChange={value => setMarkdownContentWidthSetting(value as MarkdownContentWidthSetting)}
        />
        <SettingsSelectRow
          description="Control the outer padding and spacing between blocks."
          label="Density"
          options={densityOptions}
          value={selectedDensity}
          onValueChange={value => setMarkdownDocumentDensitySetting(value as MarkdownDocumentDensitySetting)}
        />
      </SettingsSection>
    </>
  );
}

function ThemeIssueMessages({ issues }: { issues: readonly { filename: string; message: string }[] }) {
  return (
    <View className="gap-1 px-4 pb-3.5">
      {issues.map((issue) => (
        <Text className="text-sm text-text-secondary" key={`${issue.filename}-${issue.message}`}>
          {issue.filename}: {issue.message}
        </Text>
      ))}
    </View>
  );
}
