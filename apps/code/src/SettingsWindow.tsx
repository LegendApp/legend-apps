import { SelectControl, SwitchControl } from "@legend-desktop/design-system";
import {
  SettingsRow,
  SettingsSection,
  VirtualizedSettingsWindow,
  type VirtualizedSettingsWindowPage,
} from "@legend-desktop/settings-window";
import { SyntaxThemeSelectorSection } from "@legend-desktop/syntax-settings";
import { codeSettingsWindowIdentifier } from "./appConstants";
import {
  codeFontFamilyOptions,
  codeFontSizeOptions,
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

const codeFontSizeSettingOptions = codeFontSizeOptions.map((fontSize) => ({
  label: String(fontSize),
  value: fontSize,
}));

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
      <SettingsRow
        align="center"
        control={(
          <SelectControl
            accessibilityLabel="Code font"
            onChange={setCodeFontFamilySetting}
            options={codeFontFamilyOptions}
            value={fontFamily}
          />
        )}
        title="Font"
      />
      <SettingsRow
        align="center"
        control={(
          <SelectControl
            accessibilityLabel="Code font size"
            onChange={setCodeFontSizeSetting}
            options={codeFontSizeSettingOptions}
            value={fontSize}
          />
        )}
        title="Font size"
      />
      <SyntaxThemeSelectorSection
        description={null}
        onThemeChange={setCodeSyntaxThemeSetting}
        rowDescription={null}
        selectedTheme={selectedSyntaxTheme}
        title={null}
      />
      <SettingsRow
        align="center"
        control={(
          <SwitchControl
            accessibilityLabel="Syntax highlighting"
            checked={syntaxHighlightingEnabled}
            onChange={setCodeSyntaxHighlightingEnabledSetting}
          />
        )}
        title="Syntax highlighting"
      />
      <SettingsRow
        align="center"
        control={(
          <SwitchControl
            accessibilityLabel="Prewarm highlighters"
            checked={syntaxPrewarmEnabled}
            disabled={!syntaxHighlightingEnabled}
            onChange={setCodeSyntaxPrewarmEnabledSetting}
          />
        )}
        disabled={!syntaxHighlightingEnabled}
        title="Prewarm highlighters"
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
