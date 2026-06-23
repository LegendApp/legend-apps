import { SegmentedOptions, SelectControl } from "@legend-desktop/design-system";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legend-desktop/settings-window";
import { SyntaxThemeSelectorSection } from "@legend-desktop/syntax-settings";
import { diffSettingsWindowIdentifier } from "./appConstants";
import {
  diffFontFamilyOptions,
  diffFontSizeOptions,
  setDiffFontFamilySetting,
  setDiffFontSizeSetting,
  setDiffSyntaxThemeSetting,
  useDiffFontFamilySetting,
  useDiffFontSizeSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
} from "./diffSettings";

type DiffSettingsPage = "appearance";

const diffFontSizeSettingOptions = diffFontSizeOptions.map((fontSize) => ({
  label: String(fontSize),
  value: fontSize,
}));

function AppearanceSettingsPage() {
  const fontFamily = useDiffFontFamilySetting();
  const fontSize = useDiffFontSizeSetting();
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();

  return (
    <SettingsPage>
      <SettingsSection
        first
        title="Text"
      >
        <SettingsRow
          align="center"
          control={(
            <SelectControl
              accessibilityLabel="Diff font"
              onChange={setDiffFontFamilySetting}
              options={diffFontFamilyOptions}
              value={fontFamily}
            />
          )}
          title="Font"
        />
        <SettingsRow
          align="center"
          control={(
            <SegmentedOptions
              onChange={setDiffFontSizeSetting}
              options={diffFontSizeSettingOptions}
              value={fontSize}
            />
          )}
          title="Font size"
        />
      </SettingsSection>
      <SyntaxThemeSelectorSection
        onThemeChange={setDiffSyntaxThemeSetting}
        selectedTheme={selectedSyntaxTheme}
      />
    </SettingsPage>
  );
}

const pages: SettingsWindowPage<DiffSettingsPage>[] = [
  {
    id: "appearance",
    render: () => <AppearanceSettingsPage />,
    title: "Appearance",
  },
];

export function SettingsWindow() {
  const syntaxTheme = useDiffSyntaxTheme();

  return (
    <SharedSettingsWindow
      appearance={syntaxTheme.appearance}
      pages={pages}
      windowIdentifier={diffSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
