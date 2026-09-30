import { PortalProvider } from "@gorhom/portal";
import {
  VirtualizedSettingsWindow,
  type SettingsWindowPage,
} from "@legendapp/spark/settings/window";
import { getLegendDisplayThemeAppearance } from "@legend-apps/theme";
import { settingsWindowIdentifier } from "./appConstants";
import { useMarkdownDisplayThemeSetting } from "./markdownSettings";
import { AppearanceSettingsContent } from "./settings/AppearanceSettingsPage";
import { GeneralSettingsContent } from "./settings/GeneralSettingsPage";
import { HotkeysSettingsContent } from "./settings/HotkeysSettingsPage";
import { isSettingsPage, type SettingsPage } from "./settings/settingsPages";

const pages: SettingsWindowPage<SettingsPage>[] = [
  {
    id: "general",
    render: () => <GeneralSettingsContent />,
    title: "General",
  },
  {
    id: "hotkeys",
    render: () => <HotkeysSettingsContent />,
    title: "Hotkeys",
  },
  {
    id: "appearance",
    render: () => <AppearanceSettingsContent />,
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
        defaultPageId={initialSettingsPage}
        pages={pages}
        windowId={settingsWindowIdentifier}
      />
    </PortalProvider>
  );
}

export default SettingsWindow;
