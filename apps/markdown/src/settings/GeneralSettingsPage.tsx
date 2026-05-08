import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
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
    <View className="gap-4">
      <Text className="text-foreground" style={styles.pageTitle}>General</Text>
      <View className="gap-2">
        <Text className="text-foreground" style={styles.sectionTitle}>On Startup</Text>
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
      </View>
      <View className="gap-2">
        <Text className="text-foreground" style={styles.sectionTitle}>Formatting Toolbar</Text>
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
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
});
