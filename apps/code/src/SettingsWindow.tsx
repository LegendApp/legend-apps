import {
  SettingsSection,
  VirtualizedSettingsWindow,
  type VirtualizedSettingsWindowPage,
} from "@legend-desktop/settings-window";
import {
  SourceSyntaxToggleSettingsRows,
  SourceTypographySettingsRows,
  SyntaxThemeSelectorSection,
} from "@legend-desktop/syntax-settings";
import { codeSettingsWindowIdentifier } from "./appConstants";
import {
  codeFontFamilyOptions,
  setCodeFontFamilySetting,
  setCodeFontSizeSetting,
  setCodeSyntaxHighlightingEnabledSetting,
  setCodeSyntaxPrewarmEnabledSetting,
  setCodeSyntaxThemeSetting,
  useCodeFontFamilySetting,
  useCodeFontSizeSetting,
  useCodeSyntaxHighlightingEnabledSetting,
  useCodeSyntaxPrewarmEnabledSetting,
  useCodeSyntaxTheme,
  useCodeSyntaxThemeSetting,
} from "./codeSettings";

type CodeSettingsPage = "appearance";

function AppearanceSettingsContent() {
  const fontFamily = useCodeFontFamilySetting();
  const fontSize = useCodeFontSizeSetting();
  const syntaxHighlightingEnabled = useCodeSyntaxHighlightingEnabledSetting();
  const syntaxPrewarmEnabled = useCodeSyntaxPrewarmEnabledSetting();
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();

  return (
    <SettingsSection
      first
      title={null}
    >
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
        onSyntaxPrewarmChange={setCodeSyntaxPrewarmEnabledSetting}
        syntaxHighlightingEnabled={syntaxHighlightingEnabled}
        syntaxPrewarmEnabled={syntaxPrewarmEnabled}
      />
    </SettingsSection>
  );
}

const pages: VirtualizedSettingsWindowPage<CodeSettingsPage>[] = [
  {
    id: "appearance",
    renderContent: () => <AppearanceSettingsContent />,
    title: "Appearance",
  },
];

export function SettingsWindow() {
  const syntaxTheme = useCodeSyntaxTheme();

  return (
    <VirtualizedSettingsWindow
      appearance={syntaxTheme.appearance}
      estimatedItemSize={360}
      pages={pages}
      windowIdentifier={codeSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
