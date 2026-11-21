import {
  SettingsPage,
  SettingsSection,
  VirtualizedSettingsWindow,
} from "@legendapp/spark/ui/settings";
import {
  SourceSyntaxToggleSettingsRows,
  SourceTypographySettingsRows,
  SyntaxThemeSelectorSection,
} from "@legend-apps/syntax-settings";
import { codeSettingsWindowIdentifier } from "./appConstants";
import {
  codeFontFamilyOptions,
  setCodeFontFamilySetting,
  setCodeFontSizeSetting,
  setCodeSyntaxHighlightingEnabledSetting,
  setCodeSyntaxThemeSetting,
  useCodeFontFamilySetting,
  useCodeFontSizeSetting,
  useCodeSyntaxHighlightingEnabledSetting,
  useCodeSyntaxTheme,
  useCodeSyntaxThemeSetting,
} from "./codeSettings";

function AppearanceSettingsContent() {
  const fontFamily = useCodeFontFamilySetting();
  const fontSize = useCodeFontSizeSetting();
  const syntaxHighlightingEnabled = useCodeSyntaxHighlightingEnabledSetting();
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();

  return (
    <SettingsSection>
      <SourceTypographySettingsRows
        fontAccessibilityLabel="Code font"
        fontFamily={fontFamily}
        fontFamilyOptions={codeFontFamilyOptions}
        fontSize={fontSize}
        fontSizeAccessibilityLabel="Code font size"
        onFontFamilyChange={setCodeFontFamilySetting}
        onFontSizeChange={setCodeFontSizeSetting}
      />
      <SyntaxThemeSelectorSection
        description={null}
        onThemeChange={setCodeSyntaxThemeSetting}
        rowDescription={null}
        selectedTheme={selectedSyntaxTheme}
        title={null}
      />
      <SourceSyntaxToggleSettingsRows
        onSyntaxHighlightingChange={setCodeSyntaxHighlightingEnabledSetting}
        syntaxHighlightingEnabled={syntaxHighlightingEnabled}
      />
    </SettingsSection>
  );
}

export function SettingsWindow() {
  const syntaxTheme = useCodeSyntaxTheme();

  return (
    <VirtualizedSettingsWindow
      appearance={syntaxTheme.appearance}
      windowId={codeSettingsWindowIdentifier}
    >
      <SettingsPage id="appearance" title="Appearance" icon="paintbrush">
        <AppearanceSettingsContent />
      </SettingsPage>
    </VirtualizedSettingsWindow>
  );
}

export default SettingsWindow;
