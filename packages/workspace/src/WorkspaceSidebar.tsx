import { showContextMenu, type MenuItem } from "@legendapp/spark/context-menu";
import { revealInFileManager, watch } from "@legendapp/spark/files";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { flattenWorkspaceTree, getPathName, listWorkspaceDirectory, type DirectoryListing, type WorkspaceTreeRow } from "./fileTree";
import { SidebarToggle, trafficLightsWidth, withAlpha } from "./titleBar";
import { createWorkspaceFile, createWorkspaceFolder } from "./workspaceFiles";

/** Concrete colors: SF Symbols do not take PlatformColor. `primary` tints folder symbols. */
export type WorkspaceColors = { border: string; foreground: string; muted: string; primary?: string; selection: string };

export type WorkspaceSidebarProps = {
  activePath: string | null;
  colors: WorkspaceColors;
  files: readonly string[];
  folders: readonly string[];
  /** Enables folder menus (right-click, and the section header's hover button). New File creates `newFileName`. */
  folderMenu?: { newFileName: string; onRemoveFolder: (path: string) => void; windowId: string };
  /** Rows for other files are shown dimmed and cannot be opened. */
  isDocumentPath?: (path: string) => boolean;
  /** Shows an Add Folder… button while there are no folders. */
  onAddFolder?: () => void;
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

const folderMenuItems: MenuItem[] = [
  { type: "action", id: "newFile", label: "New File" },
  { type: "action", id: "newFolder", label: "New Folder" },
  { type: "separator" },
  { type: "action", id: "reveal", label: "Reveal in Finder" },
];
const rootFolderMenuItems: MenuItem[] = [...folderMenuItems, { type: "separator" }, { type: "action", id: "remove", label: "Remove Folder from Sidebar" }];

export function WorkspaceSidebar({ activePath, colors, files, folderMenu, folders, isDocumentPath, onAddFolder, onError, onOpenFile, onToggleSidebar, titleBarHeight }: WorkspaceSidebarProps) {
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

  // Changes on disk reload the listings of the changed path and its parent.
  useEffect(() => {
    const registrations = folders.map(folder => watch(folder, changed => setListings(current => {
      const stale = [changed, changed.slice(0, changed.lastIndexOf("/"))].filter(path => current.has(path));
      if (stale.length === 0) return current;
      const next = new Map(current);
      for (const path of stale) next.delete(path);
      return next;
    }), { recursive: true }));
    for (const registration of registrations) registration.catch(onError);
    return () => { for (const registration of registrations) registration.then(({ remove }) => remove()).catch(onError); };
  }, [folders, onError]);

  const toggle = (path: string) => setToggled(current => { const next = new Set(current); if (!next.delete(path)) next.add(path); return next; });
  const expand = (path: string) => { if (!expanded.has(path)) toggle(path); };
  const showFolderMenu = folderMenu && (async (path: string, position: { x: number; y: number }) => {
    const selection = await showContextMenu({ items: folders.includes(path) ? rootFolderMenuItems : folderMenuItems, position, windowId: folderMenu.windowId });
    if (selection.canceled) return;
    switch (selection.itemId) {
      case "newFile": {
        const file = await createWorkspaceFile(path, folderMenu.newFileName);
        expand(path);
        onOpenFile(file);
        return;
      }
      case "newFolder":
        await createWorkspaceFolder(path);
        expand(path);
        return;
      case "reveal":
        await revealInFileManager(path);
        return;
      case "remove":
        folderMenu.onRemoveFolder(path);
    }
  });
  const openFolderMenu = showFolderMenu && ((path: string, position: { x: number; y: number }) => { showFolderMenu(path, position).catch(onError); });
  const openable = (row: WorkspaceTreeRow) => row.isDirectory || !isDocumentPath || isDocumentPath(row.path);
  // The native list selects only file rows it can open; the open document is selected when it is in the tree.
  const selectedId = rows.some(row => row.path === activePath && !row.isDirectory && openable(row)) ? activePath : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { height: titleBarHeight }]}>
        {onToggleSidebar ? <SidebarToggle colors={colors} label="Hide Sidebar" onPress={onToggleSidebar} /> : null}
      </View>
      {onAddFolder && folders.length === 0
        ? (
          <Pressable accessibilityRole="button" onPress={onAddFolder} style={({ pressed }) => [styles.addFolder, { borderColor: colors.border }, pressed && { backgroundColor: withAlpha(colors.foreground, 0.07) }]}>
            <Text style={[styles.name, { color: colors.foreground }]}>Add Folder…</Text>
          </Pressable>
        )
        : null}
      <Sidebar
        defaultRowHeight={rowHeight}
        onSelectionChange={({ id }) => { if (id && id !== activePath) onOpenFile(id); }}
        selectedId={selectedId}
        style={styles.list}
      >
        {rows.map(row => {
          const header = row.depth === 0 && row.isDirectory && folders.includes(row.path);
          return (
            <SidebarItem
              id={row.path}
              key={row.path}
              onContextMenu={openFolderMenu && row.isDirectory ? event => openFolderMenu(row.path, event.windowPosition) : undefined}
              rowHeight={header ? sectionHeight : rowHeight}
              selectable={!row.isDirectory && openable(row)}
            >
              {header
                ? <SectionHeader colors={colors} onMenu={openFolderMenu && (position => openFolderMenu(row.path, position))} row={row} onPress={() => toggle(row.path)} />
                : <TreeRow colors={colors} openable={openable(row)} row={row} onToggle={() => toggle(row.path)} />}
            </SidebarItem>
          );
        })}
      </Sidebar>
    </View>
  );
}

/** A root folder, as a sidebar section whose chevron and menu button show on hover; the chevron also shows while collapsed. */
function SectionHeader({ colors, onMenu, onPress, row }: {
  colors: WorkspaceColors;
  onMenu?: (position: { x: number; y: number }) => void;
  onPress: () => void;
  row: WorkspaceTreeRow;
}) {
  const [hovered, setHovered] = useState(false);
  const menuButton = useRef<View>(null);
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
      <View style={styles.sectionAccessories}>
        {hovered && onMenu
          ? (
            <Pressable
              accessibilityLabel={`${row.name} Actions`}
              accessibilityRole="button"
              hitSlop={4}
              // The menu drops below the button, whether a click or the keyboard pressed it.
              onPress={() => menuButton.current?.measureInWindow((x, y, _width, height) => onMenu({ x, y: y + height }))}
              ref={menuButton}
              tooltip="Folder Actions"
              style={({ pressed }) => [styles.sectionButton, pressed && { backgroundColor: withAlpha(colors.foreground, 0.1) }]}
            >
              <SFSymbol color={colors.muted} name="ellipsis" size={11} />
            </Pressable>
          )
          : null}
        {hovered || !row.expanded ? <SFSymbol color={colors.muted} name={row.expanded ? "chevron.down" : "chevron.right"} size={10} /> : null}
      </View>
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

const styles = StyleSheet.create({
  addFolder: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: "center",
    marginHorizontal: 12,
    marginTop: 8,
  },
  disclosure: {
    alignItems: "center",
    height: rowHeight,
    justifyContent: "center",
    width: 14,
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
  sectionAccessories: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  sectionButton: {
    alignItems: "center",
    borderRadius: 4,
    height: 18,
    justifyContent: "center",
    width: 20,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
  },
});
