import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getPathName } from "./fileTree";
import type { WorkspaceColors } from "./WorkspaceSidebar";

export type DocumentTabBarProps = {
  activePath: string | null;
  colors: WorkspaceColors;
  onClose: (path: string) => void;
  onSelect: (path: string) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  paths: readonly string[];
};

export function DocumentTabBar({ activePath, colors, onClose, onSelect, onToggleSidebar, sidebarOpen, paths }: DocumentTabBarProps) {
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
        {paths.map(path => {
          const title = getPathName(path), active = path === activePath;
          return (
            <View key={path} style={[styles.tab, { borderColor: colors.border }, active && { backgroundColor: colors.selection }]}>
              <Pressable accessibilityLabel={title} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onSelect(path)}>
                <Text numberOfLines={1} style={[styles.title, { color: active ? colors.foreground : colors.muted }]}>{title}</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Close ${title}`} accessibilityRole="button" hitSlop={4} onPress={() => onClose(path)}>
                <Text style={[styles.close, { color: colors.muted }]}>×</Text>
              </Pressable>
            </View>
          );
        })}
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
