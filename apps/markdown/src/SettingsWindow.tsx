import { PortalProvider } from "@gorhom/portal";
import {
  VirtualizedSettingsWindow,
  type VirtualizedSettingsWindowPage,
} from "@legend-apps/settings-window";
import { getLegendDisplayThemeAppearance } from "@legend-apps/theme";
import { settingsWindowIdentifier } from "./appConstants";
import { useMarkdownDisplayThemeSetting } from "./markdownSettings";
import { AppearanceSettingsContent } from "./settings/AppearanceSettingsPage";
import { GeneralSettingsContent } from "./settings/GeneralSettingsPage";
import { HotkeysSettingsContent } from "./settings/HotkeysSettingsPage";
import { isSettingsPage, type SettingsPage } from "./settings/settingsPages";

const pages: VirtualizedSettingsWindowPage<SettingsPage>[] = [
  {
    id: "general",
    renderContent: () => <GeneralSettingsContent />,
    title: "General",
  },
  {
    id: "hotkeys",
    renderContent: () => <HotkeysSettingsContent />,
    title: "Hotkeys",
  },
  {
    id: "appearance",
    renderContent: () => <AppearanceSettingsContent />,
    title: "Appearance",
  },
];

export function SettingsWindow({ initialPage }: { initialPage?: string }) {
  const initialSettingsPage = initialPage && isSettingsPage(initialPage) ? initialPage : pages[0].id;
  const selectedDisplayTheme = useMarkdownDisplayThemeSetting();
  const appearance = getLegendDisplayThemeAppearance(selectedDisplayTheme);

  return (
    <PortalProvider>
      <VirtualizedSettingsWindow
        appearance={appearance}
        estimatedItemSize={640}
        initialPage={initialSettingsPage}
        pages={pages}
        windowIdentifier={settingsWindowIdentifier}
      />
    </PortalProvider>
  );
}

export default SettingsWindow;
