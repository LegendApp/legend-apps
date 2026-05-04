import { useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
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
    <View className="gap-4">
      <Text className="text-foreground" style={styles.pageTitle}>Appearance</Text>
      <View className="gap-2">
        <Text className="text-foreground" style={styles.sectionTitle}>Theme</Text>
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
