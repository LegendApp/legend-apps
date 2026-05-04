import { Sidebar } from "@legend-desktop/sidebar";
import { setWindowTitle } from "@legend-desktop/window-manager";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useResolveClassNames } from "uniwind";
import { settingsWindowIdentifier } from "./appConstants";
import { SettingsPageContent } from "./settings/SettingsPageContent";
import {
  getSettingsPageTitle,
  isSettingsPage,
  sidebarItems,
  type SettingsPage,
} from "./settings/settingsPages";

function reportSettingsWindowError(error: unknown) {
  console.error("Failed to update settings window title", error);
}

export function SettingsWindow() {
  const [selectedPage, setSelectedPage] = useState<SettingsPage>("general");
  const backgroundStyle = useResolveClassNames("bg-background");

  useEffect(() => {
    setWindowTitle(settingsWindowIdentifier, getSettingsPageTitle(selectedPage)).catch(reportSettingsWindowError);
  }, [selectedPage]);

  const handleSidebarSelectionChange = useCallback((event: { nativeEvent: { id: string } }) => {
    const nextPage = event.nativeEvent.id;
    if (isSettingsPage(nextPage)) {
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
  sidebar: {
    width: 190,
  },
});
