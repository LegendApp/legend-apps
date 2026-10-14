import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getPathName } from "./fileTree";
import type { WorkspaceColors } from "./WorkspaceSidebar";

export type DocumentTab = { key: string; title: string };

export type DocumentTabBarProps = {
  activeKey: string | null;
  colors: WorkspaceColors;
  onClose: (key: string) => void;
  onSelect: (key: string) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  tabs: readonly DocumentTab[];
};

export function getDocumentTabs(paths: readonly string[]): DocumentTab[] {
  return paths.map(path => ({ key: path, title: getPathName(path) }));
}

export function DocumentTabBar({ activeKey, colors, onClose, onSelect, onToggleSidebar, sidebarOpen, tabs }: DocumentTabBarProps) {
  return (
    // The title bar is transparent, so leave room for the traffic lights while the sidebar is hidden.
    <View style={[styles.root, { borderColor: colors.border, paddingLeft: sidebarOpen ? 8 : 78 }]}>
      <Pressable
        accessibilityLabel={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
        accessibilityRole="button"
        onPress={onToggleSidebar}
        style={styles.toggle}
      >
        <Text style={[styles.toggleText, { color: colors.muted }]}>☰</Text>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {tabs.map(({ key, title }) => (
          <View key={key} style={[styles.tab, { borderColor: colors.border }, key === activeKey && { backgroundColor: colors.selection }]}>
            <Pressable accessibilityLabel={title} accessibilityRole="tab" accessibilityState={{ selected: key === activeKey }} onPress={() => onSelect(key)}>
              <Text numberOfLines={1} style={[styles.title, { color: key === activeKey ? colors.foreground : colors.muted }]}>{title}</Text>
            </Pressable>
            <Pressable accessibilityLabel={`Close ${title}`} accessibilityRole="button" hitSlop={4} onPress={() => onClose(key)}>
              <Text style={[styles.close, { color: colors.muted }]}>×</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  close: {
    fontSize: 13,
    paddingHorizontal: 2,
  },
  root: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: 36,
  },
  tab: {
    alignItems: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    height: 36,
    maxWidth: 220,
    paddingHorizontal: 10,
  },
  tabs: {
    alignItems: "center",
  },
  title: {
    fontSize: 12,
  },
  toggle: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 14,
  },
});
