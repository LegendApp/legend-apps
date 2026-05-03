import { Sidebar } from "@legend-desktop/sidebar";
import { setWindowTitle } from "@legend-desktop/window-manager";
import { useCallback, useEffect, useSyncExternalStore, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useResolveClassNames } from "uniwind";
import {
  getMarkdownThemeSetting,
  setMarkdownThemeSetting,
  subscribeToMarkdownSettings,
  type MarkdownThemeSetting,
} from "./markdownSettings";

const settingsWindowIdentifier = "markdown-settings";

type SettingsPage = "general" | "appearance";

const settingsPages: { id: SettingsPage; title: string }[] = [
  { id: "general", title: "General" },
  { id: "appearance", title: "Appearance" },
];

const sidebarItems = settingsPages.map((page) => ({
  id: page.id,
  title: page.title,
}));

function GeneralSettingsPage() {
  return (
    <View>
      <Text className="text-foreground" style={styles.pageTitle}>General</Text>
    </View>
  );
}

function ThemeOption({
  label,
  selected,
  value,
}: {
  label: string;
  selected: boolean;
  value: MarkdownThemeSetting;
}) {
  const selectedStyle = useResolveClassNames(selected ? "border-primary bg-surface-muted" : "border-border bg-surface");
  const indicatorStyle = useResolveClassNames(selected ? "border-primary bg-primary" : "border-border bg-surface");

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className="flex-row items-center gap-3 rounded-md border px-3 py-2"
      onPress={() => setMarkdownThemeSetting(value)}
      style={selectedStyle}
    >
      <View className="h-3 w-3 rounded-full border" style={indicatorStyle} />
      <Text className="text-foreground" style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

function AppearanceSettingsPage() {
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
          <ThemeOption label="Light" selected={selectedTheme === "light"} value="light" />
          <ThemeOption label="Dark" selected={selectedTheme === "dark"} value="dark" />
        </View>
      </View>
    </View>
  );
}

function SettingsPageContent({ selectedPage }: { selectedPage: SettingsPage }) {
  if (selectedPage === "appearance") {
    return <AppearanceSettingsPage />;
  }

  return <GeneralSettingsPage />;
}

export function SettingsWindow() {
  const [selectedPage, setSelectedPage] = useState<SettingsPage>("general");
  const backgroundStyle = useResolveClassNames("bg-background");

  useEffect(() => {
    const pageTitle = settingsPages.find((page) => page.id === selectedPage)?.title ?? "Settings";
    void setWindowTitle(settingsWindowIdentifier, pageTitle);
  }, [selectedPage]);

  const handleSidebarSelectionChange = useCallback((event: { nativeEvent: { id: string } }) => {
    const nextPage = event.nativeEvent.id;
    if (nextPage === "general" || nextPage === "appearance") {
      setSelectedPage(nextPage);
    }
  }, []);

  return (
    <View className="flex-1 flex-row bg-background" style={backgroundStyle}>
      <Sidebar
        defaultRowHeight={30}
        items={sidebarItems}
        onSidebarSelectionChange={handleSidebarSelectionChange}
        selectedId={selectedPage}
        style={styles.sidebar}
      />
      <View className="flex-1 bg-background px-8 py-7" style={backgroundStyle}>
        <SettingsPageContent selectedPage={selectedPage} />
      </View>
    </View>
  );
}

export default SettingsWindow;

const styles = StyleSheet.create({
  optionText: {
    fontSize: 13,
    fontWeight: "500",
  },
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
  sidebar: {
    width: 190,
  },
});
