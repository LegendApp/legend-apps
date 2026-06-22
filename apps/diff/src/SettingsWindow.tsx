import {
  SettingsPage,
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legend-desktop/settings-window";
import { SyntaxThemeSelectorSection } from "@legend-desktop/syntax-settings";
import { diffSettingsWindowIdentifier } from "./appConstants";
import {
  setDiffSyntaxThemeSetting,
  useDiffSyntaxTheme,
  useDiffSyntaxThemeSetting,
} from "./diffSettings";

type DiffSettingsPage = "appearance";

function AppearanceSettingsPage() {
  const selectedSyntaxTheme = useDiffSyntaxThemeSetting();

  return (
    <SettingsPage>
      <SyntaxThemeSelectorSection
        first
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
