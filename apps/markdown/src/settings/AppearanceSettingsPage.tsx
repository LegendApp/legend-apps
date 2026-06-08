import { ThemeSelectorSection } from "@legend-desktop/appearance-settings";
import { getLegendThemeFiles } from "@legend-desktop/theme";
import { SettingsPage, SettingsSection } from "@legend-desktop/settings-window";
import { useMemo, useSyncExternalStore } from "react";
import { View } from "react-native";
import {
  getMarkdownContentWidthSetting,
  getMarkdownDocumentDensitySetting,
  getMarkdownFontFamilySetting,
  getMarkdownFontSizeSetting,
  getMarkdownLineHeightSetting,
  getMarkdownThemeSetting,
  setMarkdownContentWidthSetting,
  setMarkdownDocumentDensitySetting,
  setMarkdownFontFamilySetting,
  setMarkdownFontSizeSetting,
  setMarkdownLineHeightSetting,
  setMarkdownThemeSetting,
  subscribeToMarkdownSettings,
  type MarkdownContentWidthSetting,
  type MarkdownDocumentDensitySetting,
  type MarkdownFontFamilySetting,
  type MarkdownFontSizeSetting,
  type MarkdownLineHeightSetting,
  type MarkdownThemeSetting,
} from "../markdownSettings";
import { loadMarkdownUserThemesSync } from "../userThemes";
import { RadioOption } from "./RadioOption";

export function AppearanceSettingsPage() {
  const userThemeLoadResult = useMemo(() => loadMarkdownUserThemesSync({ force: true }), []);
  const themeOptions = useMemo(
    () => getLegendThemeFiles().map((theme) => ({ label: theme.name, value: theme.name })),
    [userThemeLoadResult],
  );
  const selectedTheme = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownThemeSetting,
    getMarkdownThemeSetting,
  );
  const selectedFontFamily = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownFontFamilySetting,
    getMarkdownFontFamilySetting,
  );
  const selectedFontSize = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownFontSizeSetting,
    getMarkdownFontSizeSetting,
  );
  const selectedLineHeight = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownLineHeightSetting,
    getMarkdownLineHeightSetting,
  );
  const selectedContentWidth = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownContentWidthSetting,
    getMarkdownContentWidthSetting,
  );
  const selectedDensity = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownDocumentDensitySetting,
    getMarkdownDocumentDensitySetting,
  );

  return (
    <SettingsPage>
      <ThemeSelectorSection
        first
        issues={userThemeLoadResult.issues}
        onThemeChange={setMarkdownThemeSetting}
        selectedTheme={selectedTheme}
        themes={themeOptions}
      />
      <SettingsSection card={false} title="Font">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownFontFamilySetting>
            label="System"
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
