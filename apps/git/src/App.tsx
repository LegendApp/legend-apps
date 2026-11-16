import { useEffect, useRef, useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import type { GitStatusEntry } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { conflictedEntries, createGitChanges, emptyChanges, stagedEntries, unstagedEntries } from "./gitChanges";
import { DiffPane } from "./DiffPane";
import { CommitComposer } from "./CommitComposer";
import { openFileDialog, showMessage } from "@legendapp/spark/dialogs";
import { useMenu } from "@legendapp/spark/menus";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [changes, setChanges] = useState(emptyChanges);
  const controller = useRef<ReturnType<typeof createGitChanges> | null>(null);
  const unstaged = unstagedEntries(changes.status);
  const staged = stagedEntries(changes.status);
  const selected = changes.selection;
  const busy = changes.writing || changes.loading;
  const applyLines = useRef<(() => void) | null>(null);
  const discardLines = useRef<(() => void) | null>(null);
  const commit = useRef<(() => void) | null>(null);
  const conflicts = conflictedEntries(changes.status).length;
  const selectedEntry = selected?.section === "unstaged" ? unstaged.find(entry => entry.path === selected.path) : undefined;
  const canDiscardFile = !busy && !!selectedEntry && selectedEntry.kind !== "unmerged";
  const lastDiscard = changes.lastDiscard;
  const linesLabel = `${selected?.section === "staged" ? "Unstage" : "Stage"} Selected Lines`;
  const sidebarLabel = sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar";

  useMenu({
    id: "legend-git",
    items: [
      { type: "submenu", id: "app", label: "Legend Git", target: { menu: "app" }, items: [] },
      {
        type: "submenu", id: "file", label: "File", target: { menu: "file" },
        items: [{ type: "action", id: "open-repository", label: "Open Repository…", shortcut: "Cmd+o" }],
      },
      {
        type: "submenu", id: "view", label: "View", target: { menu: "view" },
        items: [{ type: "action", id: "toggle-sidebar", label: sidebarLabel, shortcut: "Cmd+Ctrl+s" }],
      },
      {
        type: "submenu", id: "changes", label: "Changes",
        items: [
          { type: "action", id: "apply-lines", label: linesLabel, shortcut: "Cmd+Shift+l", disabled: !changes.patch?.file?.hunks.length },
          { type: "separator" },
          { type: "action", id: "discard-file", label: "Discard Changes to File…", shortcut: "Cmd+Shift+Backspace", disabled: !canDiscardFile },
          { type: "action", id: "discard-lines", label: "Discard Selected Lines…", disabled: busy || changes.patch?.section !== "unstaged" || !changes.patch.file?.hunks.length },
          { type: "action", id: "restore-discard", label: "Restore Last Discard…", disabled: busy || !lastDiscard },
          { type: "separator" },
          { type: "action", id: "commit", label: "Commit", shortcut: "Cmd+Enter", disabled: busy },
        ],
      },
    ],
    onAction: (action) => {
      if (action.itemId === "open-repository") void chooseRepository();
      if (action.itemId === "toggle-sidebar") setSidebarCollapsed(value => !value);
      if (action.itemId === "apply-lines") applyLines.current?.();
      if (action.itemId === "discard-file") void discardFile();
      if (action.itemId === "discard-lines") discardLines.current?.();
      if (action.itemId === "restore-discard") void restoreDiscard();
      if (action.itemId === "commit") commit.current?.();
    },
  });

  async function chooseRepository() {
    const owner = controller.current;
    try {
      const result = await openFileDialog({ windowId: "main", selection: "directories", multiple: false, title: "Open Repository" });
      if (!result.canceled && controller.current === owner) await owner?.open(result.paths[0]!);
    } catch (error) { console.error(error); }
  }

  async function discardFile() {
    const entry = selectedEntry;
    if (!canDiscardFile || !entry) return;
    const what = entry.kind === "untracked" ? `untracked file “${entry.path}”` : `changes to “${entry.path}”`;
    if (await confirmDestructive(`Discard ${what}?`, "Discard")) await controller.current?.discardFile(entry.path);
  }

  async function restoreDiscard() {
    const backup = controller.current && lastDiscard;
    if (!backup) return;
    const names = backup.entries.map(entry => entry.path);
    const files = names.length === 1 ? `“${names[0]}”` : `${names.length} files`;
    const message = names.length === 1
      ? `Legend Git writes ${files} back as it was before the last discard. Its current contents are backed up first, under refs/legend-git/replaced/.`
      : `Legend Git writes ${files} back as they were before the last discard. Their current contents are backed up first, under refs/legend-git/replaced/.`;
    if (await confirmDestructive(`Restore ${files}?`, "Restore", message)) await controller.current?.restoreLastDiscard();
  }

  useEffect(() => {
    void setWindowOptions("main", {
      title: changes.root ? `${changes.root.split("/").pop()} — Legend Git` : "Legend Git",
      appearance: "system",
      macos: {
        titleBar: { contentLayout: "fullSize", transparent: true, titleVisibility: "visible" },
        toolbar: {
          visible: true,
          style: "unified",
          items: [
            { type: "button", id: "toggle-sidebar", label: sidebarLabel, symbol: "sidebar.left", placement: "leading", tooltip: sidebarLabel },
            { type: "button", id: "open-repository", label: "Open Repository…", symbol: "folder", tooltip: "Open Repository…" },
            { type: "button", id: "refresh", label: "Refresh", symbol: "arrow.clockwise", tooltip: "Refresh Changes" },
            { type: "button", id: "restore-discard", label: "Restore Last Discard…", symbol: "arrow.uturn.backward", tooltip: "Restore Last Discard…", disabled: !lastDiscard },
          ],
        },
      },
    }).catch(console.error);
  }, [sidebarLabel, changes.root, !lastDiscard]); // eslint-disable-line react-hooks/exhaustive-deps -- only availability changes the toolbar

  const restoreRef = useRef(restoreDiscard);
  restoreRef.current = restoreDiscard;
  useEffect(() => {
    let disposed = false;
    const owner = createGitChanges(setChanges, watchDirectories);
    controller.current = owner;
    const registration = addMacOSWindowListener("main", event => {
      if (!disposed && event.type === "toolbarAction") {
        if (event.itemId === "refresh") void owner.refresh();
        if (event.itemId === "restore-discard") void restoreRef.current();
        if (event.itemId === "toggle-sidebar") setSidebarCollapsed(value => !value);
        if (event.itemId === "open-repository") {
          void chooseRepository();
        }
      }
    });
    const closeRegistration = addWindowListener("main", "closed", () => {
      disposed = true;
      owner.dispose();
      controller.current = null;
      void registration.then(listener => listener.remove()).catch(console.error);
      void closeRegistration.then(listener => listener.remove()).catch(console.error);
    });
    void registration.catch(console.error);
    void closeRegistration.catch(console.error);
    return () => {
      if (disposed) return;
      disposed = true;
      owner.dispose();
      controller.current = null;
      void registration.then(listener => listener.remove()).catch(console.error);
      void closeRegistration.then(listener => listener.remove()).catch(console.error);
    };
  }, []);

  return (
    <SidebarSplitView
      appearance="system"
      style={styles.root}
      sidebarWidth={240}
      sidebarMinWidth={200}
      contentMinWidth={760}
      sidebarCollapsed={sidebarCollapsed}
      onSidebarCollapsedChange={setSidebarCollapsed}
      titleBar={{ content: { height: 52, material: "titlebar" } }}
      sidebar={
        <Sidebar style={styles.root} selectedId={changes.root ? "changes" : null} onSelectionChange={() => {}} contentInsetTop={58}>
          <SidebarItem id="repositories" selectable={false}>
            <Text style={styles.section}>{changes.root?.split("/").pop() ?? "Repositories"}</Text>
          </SidebarItem>
          {changes.root ? <SidebarItem id="changes"><Text style={styles.label}>Changes</Text></SidebarItem> :
            <SidebarItem id="empty" selectable={false}><Text style={styles.secondary}>No repository open</Text></SidebarItem>}
        </Sidebar>
      }
      content={
        <View style={styles.content}>
          {changes.error && <Text accessibilityRole="alert" style={styles.error}>{changes.error}</Text>}
          {changes.root ? <>
            <Text style={styles.repository} numberOfLines={1}>{changes.root}</Text>
            <View style={styles.split}>
              <View style={styles.lists}>
                <ChangesList title="Unstaged" entries={unstaged} selectedPath={selected?.section === "unstaged" ? selected.path : null}
                  onSelect={path => void controller.current?.select(path === null ? null : { section: "unstaged", path })}
                  action="Stage" disabled={busy} onAction={path => void controller.current?.changeFile(path, true)}
                  secondaryAction="Discard…" secondaryDisabled={!canDiscardFile} onSecondaryAction={() => void discardFile()} />
                <ChangesList title="Staged" entries={staged} selectedPath={selected?.section === "staged" ? selected.path : null}
                  onSelect={path => void controller.current?.select(path === null ? null : { section: "staged", path })}
                  action="Unstage" disabled={busy} onAction={path => void controller.current?.changeFile(path, false)} />
                <CommitComposer disabled={busy} stagedCount={staged.length} conflictCount={conflicts} merging={changes.merging} unborn={changes.status?.branch.oid === "(initial)"}
                  commitRef={commit} onCommit={input => controller.current?.commit(input) ?? Promise.resolve(false)} headMessage={() => controller.current?.headMessage() ?? Promise.resolve(null)} />
              </View>
              {changes.patch ? <DiffPane patch={changes.patch} disabled={busy} applyRef={applyLines} discardRef={discardLines}
                onApply={(keys, text) => void controller.current?.changeLines(keys, text)}
                onDiscard={async (keys, text, what) => { if (await confirmDestructive(`Discard ${what}?`, "Discard")) await controller.current?.discardLines(keys, text); }} />
                : <View style={styles.placeholder}><Text style={styles.secondary}>{selected ? "Loading diff…" : "Select a file to view its changes"}</Text></View>}
            </View>
          </> : <View style={styles.empty}>
            <Text style={styles.secondary}>{changes.loading ? "Opening repository…" : "No repository open"}</Text>
            <Button onPress={() => void chooseRepository()}>Open Repository…</Button>
          </View>}
        </View>
      }
    />
  );
}

/** A native warning sheet on the main window; resolves true when the user picks the action. */
async function confirmDestructive(title: string, action: string, message = "Legend Git saves a backup first. Use Changes ▸ Restore Last Discard to bring the changes back.") {
  try {
    const result = await showMessage({ windowId: "main", kind: "warning", title, message, buttons: [{ id: "confirm", label: action }, { id: "cancel", label: "Cancel" }], defaultButtonId: "confirm", cancelButtonId: "cancel" });
    return result.buttonId === "confirm";
  } catch (error) { console.error(error); return false; }
}

function ChangesList({ title, entries, selectedPath, onSelect, action, disabled, onAction, secondaryAction, secondaryDisabled, onSecondaryAction }: {
  title: string; entries: GitStatusEntry[]; selectedPath: string | null; onSelect: (path: string | null) => void;
  action: string; disabled: boolean; onAction: (path: string) => void;
  secondaryAction?: string; secondaryDisabled?: boolean; onSecondaryAction?: () => void;
}) {
  return <View style={styles.listSection}>
    <View style={styles.heading}>
      <Text style={styles.headingLabel}>{title} ({entries.length})</Text>
      {secondaryAction ? <Button style={styles.action} disabled={secondaryDisabled} onPress={() => onSecondaryAction?.()}>{secondaryAction}</Button> : null}
      <Button style={styles.action} disabled={disabled || selectedPath === null} onPress={() => { if (selectedPath !== null) onAction(selectedPath); }}>{action}</Button>
    </View>
    {entries.length ? <Sidebar style={styles.root} selectedId={selectedPath} onSelectionChange={event => onSelect(event.id)} defaultRowHeight={30}>
      {entries.map(entry => <SidebarItem key={entry.path} id={entry.path}>
        {entry.kind === "unmerged" ? <View style={styles.row} accessibilityLabel={`${entry.path}, conflicted`}>
          <Text style={[styles.status, styles.conflict]}>{entry.indexStatus + entry.worktreeStatus}</Text>
          <Text style={styles.file} numberOfLines={1}>{entry.path}</Text>
          <Text style={styles.conflictLabel}>Conflict</Text>
        </View> : <View style={styles.row}>
          <Text style={styles.status}>{title === "Staged" ? entry.indexStatus : entry.worktreeStatus}</Text>
          <Text style={styles.file} numberOfLines={1}>{entry.originalPath ? `${entry.originalPath} → ${entry.path}` : entry.path}</Text>
        </View>}
      </SidebarItem>)}
    </Sidebar> : <Text style={styles.secondary}>No {title.toLowerCase()} changes</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingTop: 58, backgroundColor: PlatformColor("windowBackgroundColor") },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  split: { flex: 1, flexDirection: "row" },
  lists: { width: 340 },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", borderLeftWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  listSection: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  headingLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: PlatformColor("labelColor") },
  action: { width: 88, height: 28 },
  repository: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 12, color: PlatformColor("secondaryLabelColor") },
  section: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 12, fontWeight: "600", color: PlatformColor("secondaryLabelColor") },
  label: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, color: PlatformColor("labelColor") },
  secondary: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
  error: { padding: 12, fontSize: 13, color: PlatformColor("systemRedColor") },
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 },
  status: { width: 20, fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  conflict: { color: PlatformColor("systemRedColor"), fontWeight: "600" },
  conflictLabel: { fontSize: 11, fontWeight: "600", color: PlatformColor("systemRedColor") },
  file: { flex: 1, fontSize: 13, color: PlatformColor("labelColor") },
});

export default App;
