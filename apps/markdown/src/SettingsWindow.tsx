import { PortalProvider } from "@gorhom/portal";
import {
  SettingsPage,
  VirtualizedSettingsWindow,
} from "@legendapp/spark/ui/settings";
import { getLegendDisplayThemeAppearance } from "@legend-apps/theme";
import { settingsWindowIdentifier } from "./appConstants";
import { useMarkdownDisplayThemeSetting } from "./markdownSettings";
import { AppearanceSettingsContent } from "./settings/AppearanceSettingsPage";
import { GeneralSettingsContent } from "./settings/GeneralSettingsPage";
import { HotkeysSettingsContent } from "./settings/HotkeysSettingsPage";
import { isSettingsPage, type SettingsPage as SettingsPageId } from "./settings/settingsPages";

export function SettingsWindow({ initialPage }: { initialPage?: string }) {
  const initialSettingsPage = initialPage && isSettingsPage(initialPage) ? initialPage : "general";
  const selectedDisplayTheme = useMarkdownDisplayThemeSetting();
  const appearance = getLegendDisplayThemeAppearance(selectedDisplayTheme);

  return (
    <PortalProvider>
      <VirtualizedSettingsWindow<SettingsPageId>
        appearance={appearance}
        defaultPageId={initialSettingsPage}
        windowId={settingsWindowIdentifier}
      >
        <SettingsPage id="general" title="General" icon="gearshape">
          <GeneralSettingsContent />
        </SettingsPage>
        <SettingsPage id="hotkeys" title="Hotkeys" icon="keyboard">
          <HotkeysSettingsContent />
        </SettingsPage>
        <SettingsPage id="appearance" title="Appearance" icon="paintbrush">
          <AppearanceSettingsContent />
        </SettingsPage>
      </VirtualizedSettingsWindow>
    </PortalProvider>
  );
}

export default SettingsWindow;
