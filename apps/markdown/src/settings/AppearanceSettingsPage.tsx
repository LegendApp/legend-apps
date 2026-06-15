import { ThemeSelectorSection } from "@legend-desktop/appearance-settings";
import { RadioOption } from "@legend-desktop/design-system";
import { getLegendDisplayThemeFiles, getMarkdownLayoutThemeFiles } from "@legend-desktop/theme";
import { SettingsPage, SettingsSection } from "@legend-desktop/settings-window";
import { useMemo } from "react";
import { View } from "react-native";
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

function formatThemeLabel(name: string) {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AppearanceSettingsPage() {
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
    <SettingsPage>
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
      <SettingsSection card={false} title="Font">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownFontFamilySetting>
            label="Layout Default"
            onSelect={setMarkdownFontFamilySetting}
            selected={selectedFontFamily === "system"}
            value="system"
          />
          <RadioOption<MarkdownFontFamilySetting>
            label="Serif"
            onSelect={setMarkdownFontFamilySetting}
            selected={selectedFontFamily === "serif"}
            value="serif"
          />
          <RadioOption<MarkdownFontFamilySetting>
            label="Monospace"
            onSelect={setMarkdownFontFamilySetting}
            selected={selectedFontFamily === "mono"}
            value="mono"
          />
        </View>
      </SettingsSection>
      <SettingsSection card={false} title="Font Size">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownFontSizeSetting>
            label="Small"
            onSelect={setMarkdownFontSizeSetting}
            selected={selectedFontSize === "small"}
            value="small"
          />
          <RadioOption<MarkdownFontSizeSetting>
            label="Default"
            onSelect={setMarkdownFontSizeSetting}
            selected={selectedFontSize === "default"}
            value="default"
          />
          <RadioOption<MarkdownFontSizeSetting>
            label="Large"
            onSelect={setMarkdownFontSizeSetting}
            selected={selectedFontSize === "large"}
            value="large"
          />
          <RadioOption<MarkdownFontSizeSetting>
            label="Extra Large"
            onSelect={setMarkdownFontSizeSetting}
            selected={selectedFontSize === "xlarge"}
            value="xlarge"
          />
        </View>
      </SettingsSection>
      <SettingsSection card={false} title="Line Height">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownLineHeightSetting>
            label="Compact"
            onSelect={setMarkdownLineHeightSetting}
            selected={selectedLineHeight === "compact"}
            value="compact"
          />
          <RadioOption<MarkdownLineHeightSetting>
            label="Normal"
            onSelect={setMarkdownLineHeightSetting}
            selected={selectedLineHeight === "normal"}
            value="normal"
          />
          <RadioOption<MarkdownLineHeightSetting>
            label="Relaxed"
            onSelect={setMarkdownLineHeightSetting}
            selected={selectedLineHeight === "relaxed"}
            value="relaxed"
          />
        </View>
      </SettingsSection>
      <SettingsSection card={false} title="Maximum Document Width">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownContentWidthSetting>
            label="Narrow"
            onSelect={setMarkdownContentWidthSetting}
            selected={selectedContentWidth === "narrow"}
            value="narrow"
          />
          <RadioOption<MarkdownContentWidthSetting>
            label="Standard"
            onSelect={setMarkdownContentWidthSetting}
            selected={selectedContentWidth === "standard"}
            value="standard"
          />
          <RadioOption<MarkdownContentWidthSetting>
            label="Wide"
            onSelect={setMarkdownContentWidthSetting}
            selected={selectedContentWidth === "wide"}
            value="wide"
          />
          <RadioOption<MarkdownContentWidthSetting>
            label="Full"
            onSelect={setMarkdownContentWidthSetting}
            selected={selectedContentWidth === "full"}
            value="full"
          />
        </View>
      </SettingsSection>
      <SettingsSection card={false} title="Density">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownDocumentDensitySetting>
            label="Compact"
            onSelect={setMarkdownDocumentDensitySetting}
            selected={selectedDensity === "compact"}
            value="compact"
          />
          <RadioOption<MarkdownDocumentDensitySetting>
            label="Comfortable"
            onSelect={setMarkdownDocumentDensitySetting}
            selected={selectedDensity === "comfortable"}
            value="comfortable"
          />
          <RadioOption<MarkdownDocumentDensitySetting>
            label="Spacious"
            onSelect={setMarkdownDocumentDensitySetting}
            selected={selectedDensity === "spacious"}
            value="spacious"
          />
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}
