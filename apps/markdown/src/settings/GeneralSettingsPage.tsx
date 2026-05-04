import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  getMarkdownStartupBehaviorSetting,
  setMarkdownStartupBehaviorSetting,
  subscribeToMarkdownSettings,
  type MarkdownStartupBehaviorSetting,
} from "../markdownSettings";
import { RadioOption } from "./RadioOption";

export function GeneralSettingsPage() {
  const startupBehavior = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownStartupBehaviorSetting,
    getMarkdownStartupBehaviorSetting,
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
