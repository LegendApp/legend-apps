import { LegendList } from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { flattenWorkspaceTree, getPathName, listWorkspaceDirectory, type DirectoryListing, type WorkspaceTreeRow } from "./fileTree";

export type WorkspaceColors = { border: string; foreground: string; muted: string; selection: string };

export type WorkspaceSidebarProps = {
  activePath: string | null;
  colors: WorkspaceColors;
  files: readonly string[];
  folders: readonly string[];
  /** Rows for other files are shown dimmed and cannot be opened. */
  isDocumentPath?: (path: string) => boolean;
  onAddFile: () => void;
  onAddFolder: () => void;
  onError: (error: unknown) => void;
  onOpenFile: (path: string) => void;
};

const rowHeight = 24;

export function WorkspaceSidebar({ activePath, colors, files, folders, isDocumentPath, onAddFile, onAddFolder, onError, onOpenFile }: WorkspaceSidebarProps) {
  const [listings, setListings] = useState<ReadonlyMap<string, DirectoryListing>>(new Map());
  // Root folders start expanded and other directories collapsed; a toggle flips that.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set());
  const loading = useRef(new Set<string>());
  const expanded = useMemo(() => new Set([
    ...folders.filter(folder => !toggled.has(folder)),
    ...[...toggled].filter(path => !folders.includes(path)),
  ]), [folders, toggled]);
  const roots = useMemo(() => [
    ...folders.map(path => ({ isDirectory: true, name: getPathName(path), path })),
    ...files.map(path => ({ isDirectory: false, name: getPathName(path), path })),
  ], [files, folders]);
  const rows = useMemo(() => flattenWorkspaceTree(roots, listings, expanded), [expanded, listings, roots]);

  useEffect(() => {
    for (const row of rows) {
      if (!row.expanded || listings.has(row.path) || loading.current.has(row.path)) continue;
      loading.current.add(row.path);
      listWorkspaceDirectory(row.path, row.parent ? listings.get(row.parent)?.scopes : [])
        .catch((error: unknown) => { onError(error); return { entries: [], scopes: [] }; })
        .then(listing => { setListings(current => new Map(current).set(row.path, listing)); })
        .finally(() => loading.current.delete(row.path));
    }
  }, [listings, onError, rows]);

  const renderItem = useCallback(({ item }: { item: WorkspaceTreeRow }) => {
    const openable = item.isDirectory || !isDocumentPath || isDocumentPath(item.path);
    const onPress = item.isDirectory
      ? () => setToggled(current => { const next = new Set(current); if (!next.delete(item.path)) next.add(item.path); return next; })
      : () => onOpenFile(item.path);
    return (
      <Pressable
        accessibilityLabel={item.name}
        accessibilityRole="button"
        disabled={!openable}
        onPress={onPress}
        style={[styles.row, { paddingLeft: 8 + item.depth * 14 }, item.path === activePath && { backgroundColor: colors.selection }]}
      >
        <Text style={[styles.disclosure, { color: colors.muted }]}>{item.isDirectory ? (item.expanded ? "▾" : "▸") : ""}</Text>
        <Text numberOfLines={1} style={[styles.name, { color: openable ? colors.foreground : colors.muted }]}>{item.name}</Text>
      </Pressable>
    );
  }, [activePath, colors, isDocumentPath, onOpenFile]);

  return (
    <View style={styles.root}>
      <View style={[styles.actions, { borderColor: colors.border }]}>
        <Pressable accessibilityLabel="Add File" accessibilityRole="button" onPress={onAddFile} style={styles.action}>
          <Text style={[styles.actionText, { color: colors.foreground }]}>Add File</Text>
        </Pressable>
        <Pressable accessibilityLabel="Add Folder" accessibilityRole="button" onPress={onAddFolder} style={styles.action}>
          <Text style={[styles.actionText, { color: colors.foreground }]}>Add Folder</Text>
        </Pressable>
      </View>
      <LegendList
        data={rows}
        estimatedItemSize={rowHeight}
        extraData={activePath}
        keyExtractor={(row: WorkspaceTreeRow) => row.path}
        recycleItems
        renderItem={renderItem}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "500",
  },
  actions: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 4,
    // Clears the traffic lights over the full-size title bar.
    paddingBottom: 6,
    paddingHorizontal: 8,
    paddingTop: 40,
  },
  disclosure: {
    fontSize: 10,
    width: 14,
  },
  list: {
    flex: 1,
  },
  name: {
    flexShrink: 1,
    fontSize: 13,
  },
  root: {
    flex: 1,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    height: rowHeight,
    paddingRight: 8,
  },
});
