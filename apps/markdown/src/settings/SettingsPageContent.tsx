import { AppearanceSettingsPage } from "./AppearanceSettingsPage";
import { GeneralSettingsPage } from "./GeneralSettingsPage";
import type { SettingsPage } from "./settingsPages";

export function SettingsPageContent({ selectedPage }: { selectedPage: SettingsPage }) {
  if (selectedPage === "appearance") {
    return <AppearanceSettingsPage />;
  }

  return <GeneralSettingsPage />;
}
