import { SelectControl } from "@legend-desktop/design-system";
import {
  SettingsPage,
  SettingsRow,
  SettingsSection,
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legend-desktop/settings-window";
import { bundledSyntaxThemes } from "@legend-desktop/syntax-parser";
import { codeSettingsWindowIdentifier } from "./appConstants";
import {
  setCodeSyntaxThemeSetting,
  useCodeSyntaxTheme,
  useCodeSyntaxThemeSetting,
} from "./codeSettings";

type CodeSettingsPage = "appearance";

const syntaxThemeOptions = bundledSyntaxThemes.map((theme) => ({
  label: theme.label,
  value: theme.name,
}));

function AppearanceSettingsPage() {
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();

  return (
    <SettingsPage>
      <SettingsSection
        card={false}
        contentClassName="gap-3"
        description="Choose the TextMate theme used for syntax colors in source views."
        first
        title="Source"
      >
        <SettingsRow
          align="center"
          control={(
            <SelectControl
              accessibilityLabel="Syntax Theme"
              onChange={setCodeSyntaxThemeSetting}
              options={syntaxThemeOptions}
              value={selectedSyntaxTheme}
            />
          )}
          description={`${bundledSyntaxThemes.length} bundled Shiki themes are available.`}
          title="Syntax Theme"
        />
      </SettingsSection>
    </SettingsPage>
  );
}

const pages: SettingsWindowPage<CodeSettingsPage>[] = [
  {
    id: "appearance",
    render: () => <AppearanceSettingsPage />,
    title: "Appearance",
  },
];

export function SettingsWindow() {
  const syntaxTheme = useCodeSyntaxTheme();

  return (
    <SharedSettingsWindow
      appearance={syntaxTheme.appearance}
      pages={pages}
      windowIdentifier={codeSettingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
