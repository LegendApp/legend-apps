import { getPathName } from "@legend-apps/workspace";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getMarkdownMenuShortcutLabel } from "./markdownMenus";

const emptyTabPrefix = "legend-markdown-new-tab:";
let emptyTabCount = 0;

/** A tab with no document yet; its path only names it in the pane. */
export function createEmptyTab() {
  return `${emptyTabPrefix}${++emptyTabCount}`;
}

export function isEmptyTab(path: string | null) {
  return !!path?.startsWith(emptyTabPrefix);
}

export function getMarkdownTabTitle(path: string) {
  return isEmptyTab(path) ? "New Tab" : getPathName(path);
}

/** What an empty tab or an idle pane shows: New File and Open File, labeled with their menu shortcuts. */
export function MarkdownEmptyState({ onNewFile, onOpenFile }: { onNewFile: () => void; onOpenFile: () => void }) {
  return (
    <View style={styles.actions}>
      <EmptyStateAction label="New File" onPress={onNewFile} shortcut={getMarkdownMenuShortcutLabel("new")} />
      <EmptyStateAction label="Open File" onPress={onOpenFile} shortcut={getMarkdownMenuShortcutLabel("open")} />
    </View>
  );
}

function EmptyStateAction({ label, onPress, shortcut }: { label: string; onPress: () => void; shortcut: string }) {
  return (
    <Pressable
      accessibilityHint={shortcut}
      accessibilityLabel={label}
      accessibilityRole="button"
      className="rounded-md hover:bg-surface-muted"
      onPress={onPress}
      style={styles.action}
    >
      <Text className="text-foreground" style={styles.label}>{label}</Text>
      <Text className="text-muted" style={styles.label}>{shortcut}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 200,
  },
  actions: {
    gap: 4,
  },
  label: {
    fontSize: 13,
  },
});
