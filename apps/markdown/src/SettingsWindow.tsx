import { SidebarSplitView, type SidebarSplitViewResizeEvent } from "@legend-desktop/appkit-split-view";
import { setWindowTitle } from "@legend-desktop/window-manager";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent } from "react-native";
import { useResolveClassNames } from "uniwind";
import { settingsWindowIdentifier } from "./appConstants";
import { SettingsPageContent } from "./settings/SettingsPageContent";
import {
  getSettingsPageTitle,
  sidebarItems,
  type SettingsPage,
} from "./settings/settingsPages";

function reportSettingsWindowError(error: unknown) {
  console.error("Failed to update settings window title", error);
}

const MACOS_SIDEBAR_TOP_INSET = 52;

function SettingsSidebarContent({
  onSelectionChange,
  selectedPage,
}: {
  onSelectionChange: (page: SettingsPage) => void;
  selectedPage: SettingsPage;
}) {
  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={styles.sidebarContent}
      showsVerticalScrollIndicator={false}
    >
      {sidebarItems.map((item) => {
        const isSelected = selectedPage === item.id;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className={`h-7 justify-center rounded-md px-2 ${isSelected ? "bg-white/10" : "hover:bg-white/10 active:bg-white/15"}`}
            key={item.id}
            onPress={() => onSelectionChange(item.id)}
          >
            <Text
              className={isSelected ? "text-foreground font-medium" : "text-foreground"}
              numberOfLines={1}
              style={styles.sidebarItemText}
            >
              {item.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SettingsWindow() {
  const [selectedPage, setSelectedPage] = useState<SettingsPage>("general");
  const [paneMetrics, setPaneMetrics] = useState({ contentWidth: 0, height: 0, sidebarWidth: 0 });
  const backgroundStyle = useResolveClassNames("bg-background");

  useEffect(() => {
    setWindowTitle(settingsWindowIdentifier, getSettingsPageTitle(selectedPage)).catch(reportSettingsWindowError);
  }, [selectedPage]);

  const handleSidebarSelectionChange = useCallback((nextPage: SettingsPage) => {
    setSelectedPage(nextPage);
  }, []);

  const handleSplitViewResize = useCallback((event: NativeSyntheticEvent<SidebarSplitViewResizeEvent>) => {
    const nextContentWidth = Math.round(event.nativeEvent.contentWidth);
    const nextHeight = Math.round(event.nativeEvent.height);
    const nextSidebarWidth = Math.round(event.nativeEvent.sidebarWidth);

    if (nextContentWidth > 0 || nextHeight > 0 || nextSidebarWidth > 0) {
      setPaneMetrics((current) => {
        const next = {
          contentWidth: nextContentWidth > 0 ? nextContentWidth : current.contentWidth,
          height: nextHeight > 0 ? nextHeight : current.height,
          sidebarWidth: nextSidebarWidth > 0 ? nextSidebarWidth : current.sidebarWidth,
        };
        return current.contentWidth === next.contentWidth &&
          current.height === next.height &&
          current.sidebarWidth === next.sidebarWidth
          ? current
          : next;
      });
    }
  }, []);

  return (
    <SidebarSplitView
      className="flex-1 bg-background"
      contentMinWidth={360}
      onSplitViewDidResize={handleSplitViewResize}
      sidebarMinWidth={180}
      style={[styles.root, backgroundStyle]}
    >
      <View
        className="flex-1"
        style={[
          styles.pane,
          {
            height: paneMetrics.height || undefined,
            minHeight: paneMetrics.height || undefined,
            width: paneMetrics.sidebarWidth || undefined,
          },
        ]}
      >
        <SettingsSidebarContent
          onSelectionChange={handleSidebarSelectionChange}
          selectedPage={selectedPage}
        />
      </View>
      <View
        className="flex-1 bg-background"
        style={[
          backgroundStyle,
          styles.pane,
          {
            height: paneMetrics.height || undefined,
            minHeight: paneMetrics.height || undefined,
            width: paneMetrics.contentWidth || undefined,
          },
        ]}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.pageContent}
          horizontal={false}
        >
          <SettingsPageContent selectedPage={selectedPage} />
        </ScrollView>
      </View>
    </SidebarSplitView>
  );
}

export default SettingsWindow;

const styles = StyleSheet.create({
  pageContent: {
    alignSelf: "center",
    flexDirection: "column",
    maxWidth: 896,
    paddingHorizontal: 24,
    paddingTop: 56,
    width: "100%",
  },
  root: {
    flex: 1,
  },
  pane: {
    flex: 1,
    minWidth: 0,
  },
  sidebarContent: {
    paddingHorizontal: 8,
    paddingTop: MACOS_SIDEBAR_TOP_INSET,
  },
  sidebarItemText: {
    fontSize: 13,
  },
});
