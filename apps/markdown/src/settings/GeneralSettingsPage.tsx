import { SettingsPage, SettingsSection } from "@legend-desktop/settings-window";
import { useSyncExternalStore } from "react";
import { View } from "react-native";
import {
  getMarkdownStartupBehaviorSetting,
  getMarkdownFormattingToolbarModeSetting,
  setMarkdownStartupBehaviorSetting,
  setMarkdownFormattingToolbarModeSetting,
  subscribeToMarkdownSettings,
  type MarkdownFormattingToolbarModeSetting,
  type MarkdownStartupBehaviorSetting,
} from "../markdownSettings";
import { RadioOption } from "./RadioOption";

export function GeneralSettingsPage() {
  const startupBehavior = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownStartupBehaviorSetting,
    getMarkdownStartupBehaviorSetting,
  );
  const formattingToolbarMode = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownFormattingToolbarModeSetting,
    getMarkdownFormattingToolbarModeSetting,
  );

  return (
    <SettingsPage>
      <SettingsSection card={false} first title="On Startup">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownStartupBehaviorSetting>
            label="New Document"
            onSelect={setMarkdownStartupBehaviorSetting}
            selected={startupBehavior === "newDocument"}
            value="newDocument"
          />
          <RadioOption<MarkdownStartupBehaviorSetting>
            label="Last Document"
            onSelect={setMarkdownStartupBehaviorSetting}
            selected={startupBehavior === "lastDocument"}
            value="lastDocument"
          />
        </View>
      </SettingsSection>
      <SettingsSection card={false} title="Formatting Toolbar">
        <View accessibilityRole="radiogroup" className="gap-2">
          <RadioOption<MarkdownFormattingToolbarModeSetting>
            label="Above Selection"
            onSelect={setMarkdownFormattingToolbarModeSetting}
            selected={formattingToolbarMode === "selection"}
            value="selection"
          />
          <RadioOption<MarkdownFormattingToolbarModeSetting>
            label="Top Toolbar"
            onSelect={setMarkdownFormattingToolbarModeSetting}
            selected={formattingToolbarMode === "top"}
            value="top"
          />
          <RadioOption<MarkdownFormattingToolbarModeSetting>
            label="Hidden"
            onSelect={setMarkdownFormattingToolbarModeSetting}
            selected={formattingToolbarMode === "hidden"}
            value="hidden"
          />
        </View>
      </SettingsSection>
    </SettingsPage>
  );
}
