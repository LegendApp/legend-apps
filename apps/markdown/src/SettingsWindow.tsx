import {
  SettingsWindow as SharedSettingsWindow,
  type SettingsWindowPage,
} from "@legend-desktop/settings-window";
import { settingsWindowIdentifier } from "./appConstants";
import { AppearanceSettingsPage } from "./settings/AppearanceSettingsPage";
import { GeneralSettingsPage } from "./settings/GeneralSettingsPage";
import { isSettingsPage, type SettingsPage } from "./settings/settingsPages";

const pages: SettingsWindowPage<SettingsPage>[] = [
  {
    id: "general",
    render: () => <GeneralSettingsPage />,
    title: "General",
  },
  {
    id: "appearance",
    render: () => <AppearanceSettingsPage />,
    title: "Appearance",
  },
];

export function SettingsWindow({ initialPage }: { initialPage?: string }) {
  const initialSettingsPage = initialPage && isSettingsPage(initialPage) ? initialPage : undefined;
  return (
    <SharedSettingsWindow
      initialPage={initialSettingsPage}
      pages={pages}
      windowIdentifier={settingsWindowIdentifier}
    />
  );
}

export default SettingsWindow;
