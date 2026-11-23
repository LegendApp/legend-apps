import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { flattenWorkspaceTree, getPathName, listWorkspaceDirectory, type DirectoryListing, type WorkspaceTreeRow } from "./fileTree";
import { SidebarToggle, trafficLightsWidth, withAlpha } from "./titleBar";

/** Concrete colors: SF Symbols do not take PlatformColor. `primary` tints folder symbols. */
export type WorkspaceColors = { border: string; foreground: string; muted: string; primary?: string; selection: string };

export type WorkspaceSidebarProps = {
  activePath: string | null;
  colors: WorkspaceColors;
  files: readonly string[];
  folders: readonly string[];
  /** Rows for other files are shown dimmed and cannot be opened. */
  isDocumentPath?: (path: string) => boolean;
  /** Resolves with the added files; the first one opens. */
  onAddFile: () => Promise<readonly string[]>;
  onAddFolder: () => void;
  onError: (error: unknown) => void;
  onOpenFile: (path: string) => void;
  /** Shows the sidebar toggle beside the traffic lights, where the title bar's toggle sits while the sidebar is hidden. */
  onToggleSidebar?: () => void;
  /** The chrome theme's title bar height; the list starts below it. */
  titleBarHeight: number;
};

const rowHeight = 24;
const sectionHeight = 26;
const indentation = 16;

export function WorkspaceSidebar({ activePath, colors, files, folders, isDocumentPath, onAddFile, onAddFolder, onError, onOpenFile, onToggleSidebar, titleBarHeight }: WorkspaceSidebarProps) {
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

  const toggle = (path: string) => setToggled(current => { const next = new Set(current); if (!next.delete(path)) next.add(path); return next; });
  const openable = (row: WorkspaceTreeRow) => row.isDirectory || !isDocumentPath || isDocumentPath(row.path);
  // The native list selects only file rows it can open; the open document is selected when it is in the tree.
  const selectedId = rows.some(row => row.path === activePath && !row.isDirectory && openable(row)) ? activePath : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { height: titleBarHeight }]}>
        {onToggleSidebar ? <SidebarToggle colors={colors} label="Hide Sidebar" onPress={onToggleSidebar} /> : null}
      </View>
      <Sidebar
        defaultRowHeight={rowHeight}
        onSelectionChange={({ id }) => { if (id && id !== activePath) onOpenFile(id); }}
        selectedId={selectedId}
        style={styles.list}
      >
        {rows.map(row => {
          const header = row.depth === 0 && row.isDirectory && folders.includes(row.path);
          return (
            <SidebarItem id={row.path} key={row.path} rowHeight={header ? sectionHeight : rowHeight} selectable={!row.isDirectory && openable(row)}>
              {header
                ? <SectionHeader colors={colors} row={row} onPress={() => toggle(row.path)} />
                : <TreeRow colors={colors} openable={openable(row)} row={row} onToggle={() => toggle(row.path)} />}
            </SidebarItem>
          );
        })}
      </Sidebar>
      <View style={styles.footer}>
        <FooterButton colors={colors} label="Add File" symbol="doc.badge.plus" onPress={() => { void onAddFile().then(paths => { if (paths[0]) onOpenFile(paths[0]); }); }} />
        <FooterButton colors={colors} label="Add Folder" symbol="folder.badge.plus" onPress={onAddFolder} />
      </View>
    </View>
  );
}

/** A root folder, as a sidebar section whose chevron shows on hover or while collapsed. */
function SectionHeader({ colors, onPress, row }: { colors: WorkspaceColors; onPress: () => void; row: WorkspaceTreeRow }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityLabel={row.name}
      accessibilityRole="button"
      accessibilityState={{ expanded: row.expanded }}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={styles.section}
    >
      <Text numberOfLines={1} style={[styles.sectionTitle, { color: colors.muted }]}>{row.name}</Text>
      {hovered || !row.expanded ? <SFSymbol color={colors.muted} name={row.expanded ? "chevron.down" : "chevron.right"} size={10} /> : null}
    </Pressable>
  );
}

function TreeRow({ colors, onToggle, openable, row }: { colors: WorkspaceColors; onToggle: () => void; openable: boolean; row: WorkspaceTreeRow }) {
  const content = (
    <>
      <View style={styles.disclosure}>
        {row.isDirectory ? <SFSymbol color={colors.muted} name={row.expanded ? "chevron.down" : "chevron.right"} size={10} /> : null}
      </View>
      <View style={styles.icon}>
        <SFSymbol
          color={row.isDirectory ? colors.primary ?? colors.muted : withAlpha(colors.muted, openable ? 1 : 0.6)}
          name={row.isDirectory ? "folder" : openable ? "doc.text" : "doc"}
          size={14}
        />
      </View>
      <Text numberOfLines={1} style={[styles.name, { color: openable ? colors.foreground : colors.muted }]}>{row.name}</Text>
    </>
  );
  // Roots of a folder section sit at depth 1; loose files sit at depth 0 beside them.
  const style = [styles.row, { paddingLeft: Math.max(0, row.depth - 1) * indentation }];
  return row.isDirectory
    ? <Pressable accessibilityLabel={row.name} accessibilityRole="button" accessibilityState={{ expanded: row.expanded }} onPress={onToggle} style={style}>{content}</Pressable>
    : <View accessibilityLabel={row.name} accessibilityState={{ disabled: !openable }} accessible style={style}>{content}</View>;
}

function FooterButton({ colors, label, onPress, symbol }: { colors: WorkspaceColors; label: string; onPress: () => void; symbol: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onPress}
      style={({ pressed }) => [styles.footerButton, (hovered || pressed) && { backgroundColor: withAlpha(colors.foreground, pressed ? 0.12 : 0.07) }]}
    >
      <SFSymbol color={colors.muted} name={symbol} size={15} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    alignItems: "center",
    height: rowHeight,
    justifyContent: "center",
    width: 14,
  },
  footer: {
    flexDirection: "row",
    gap: 2,
    paddingBottom: 6,
    paddingHorizontal: 8,
    paddingTop: 2,
  },
  footerButton: {
    alignItems: "center",
    borderRadius: 6,
    height: 26,
    justifyContent: "center",
    width: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: trafficLightsWidth,
  },
  icon: {
    alignItems: "center",
    height: rowHeight,
    justifyContent: "center",
    marginRight: 5,
    width: 16,
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
  section: {
    alignItems: "center",
    flexDirection: "row",
    height: sectionHeight,
    justifyContent: "space-between",
    paddingLeft: 6,
    paddingRight: 8,
    paddingTop: 4,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
  },
});
