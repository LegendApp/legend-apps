import { useMemo } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { pathParts } from "./FileRow";
import { useDensity, usePanelOptions } from "./settings/panelOptions";
import type { PanelOptions } from "./settings/schema";
import { densityHeights } from "./settings/theme";

export type FileListOptions = PanelOptions["fileList"];
export type FileListRow<T> = { type: "folder"; id: string; folder: string } | { type: "file"; id: string; entry: T; indent: boolean };
/** The panels a file list can be: a Changes list reads the pane's own (`changes`, `staged`, `unstaged`), a commit's files `fileList`. */
const fileListPanels = ["fileList", "unstaged", "staged", "changes"] as const;

const byText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/**
 * A file list's rows: in the list's order (`sort: "path"`), or by name or status, and with `style: "tree"` grouped under one row per
 * folder, files sorted inside it (spec §4 `FileListOptions`). `statusOf` gives the status sort key.
 */
export function fileListRows<T extends { path: string }>(entries: readonly T[], options: Pick<FileListOptions, "style" | "sort">, statusOf?: (entry: T) => string): FileListRow<T>[] {
  // "path" keeps the list's own order: Git's, by path, with conflicted files first. The sort is stable.
  const key = (entry: T) => options.sort === "name" ? pathParts(entry.path).name.toLowerCase() : options.sort === "status" ? statusOf?.(entry) ?? "" : "";
  const sorted = [...entries].sort((a, b) => (options.style === "tree" ? byText(pathParts(a.path).folder, pathParts(b.path).folder) : 0) || byText(key(a), key(b)));
  if (options.style !== "tree") return sorted.map(entry => ({ type: "file", id: entry.path, entry, indent: false }));
  const rows: FileListRow<T>[] = [];
  let folder: string | null = null;
  for (const entry of sorted) {
    const own = pathParts(entry.path).folder;
    if (own !== folder) {
      folder = own;
      if (own) rows.push({ type: "folder", id: `folder:${own}`, folder: own });
    }
    rows.push({ type: "file", id: entry.path, entry, indent: !!own });
  }
  return rows;
}

/** The pane's file list options, its row height, and its rows (memoized on the entries and the options that order them). */
export function useFileList<T extends { path: string }>(entries: readonly T[], fallbackPanel: (typeof fileListPanels)[number], statusOf?: (entry: T) => string) {
  const options = usePanelOptions(fallbackPanel, fileListPanels);
  const rowHeight = densityHeights[useDensity(options.density)].row;
  const rows = useMemo(() => fileListRows(entries, options, statusOf), [entries, options.style, options.sort]); // eslint-disable-line react-hooks/exhaustive-deps -- statusOf is a pure key
  // Tree rows sit under their folder's row, so they don't repeat the folder.
  return { rows, rowHeight, showFolder: options.showFolder && options.style === "flat" };
}

/** A tree list's folder row: not selectable. */
export function folderItem(row: { id: string; folder: string }, rowHeight: number) {
  return <SidebarItem key={row.id} id={row.id} selectable={false} rowHeight={rowHeight}>
    <View style={styles.folder} accessible accessibilityRole="header" accessibilityLabel={`Folder ${row.folder}`}>
      <SFSymbol name="folder" size={12} color="#8E8E93" />
      <Text style={styles.folderName} numberOfLines={1} ellipsizeMode="head">{row.folder}</Text>
    </View>
  </SidebarItem>;
}

const styles = StyleSheet.create({
  folder: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 },
  folderName: { flex: 1, fontSize: 12, fontWeight: "500", color: PlatformColor("secondaryLabelColor") },
});
