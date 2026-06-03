import { SettingsPage, SettingsSection } from "@legend-desktop/settings-window";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import {
  getMarkdownThemeSetting,
  setMarkdownThemeSetting,
  subscribeToMarkdownSettings,
  type MarkdownThemeSetting,
} from "../markdownSettings";
import { RadioOption } from "./RadioOption";

export function AppearanceSettingsPage() {
  const selectedTheme = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownThemeSetting,
    getMarkdownThemeSetting,
  );

  return (
    <SettingsPage>
      <SettingsSection card={false} first title="Theme">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownThemeSetting>
            label="Light"
            onSelect={setMarkdownThemeSetting}
            selected={selectedTheme === "light"}
            value="light"
          />
          <RadioOption<MarkdownThemeSetting>
            label="Dark"
            onSelect={setMarkdownThemeSetting}
            selected={selectedTheme === "dark"}
            value="dark"
          />
          <RadioOption<MarkdownThemeSetting>
            label="Grey"
            onSelect={setMarkdownThemeSetting}
            selected={selectedTheme === "grey"}
            value="grey"
          />
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}
