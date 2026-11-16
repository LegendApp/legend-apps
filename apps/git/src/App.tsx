import { useEffect, useRef, useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import type { GitStatusEntry } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { conflictedEntries, createGitChanges, emptyChanges, stagedEntries, unstagedEntries } from "./gitChanges";
import { DiffPane } from "./DiffPane";
import { HistoryView, type HistoryActions } from "./HistoryView";
import { commitGitHubUrl, createGitHistory, emptyHistory } from "./gitHistory";
import { setStringAsync } from "@legendapp/spark/clipboard";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { openURL } from "@legendapp/spark/links";
import { EmptyState } from "./EmptyState";
import { FileRow, useSymbolColor } from "./FileRow";
import { CommitComposer, type CommitMessageGenerator } from "./CommitComposer";
import { openFileDialog, showMessage } from "@legendapp/spark/dialogs";
import { useMenu } from "@legendapp/spark/menus";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [changes, setChanges] = useState(emptyChanges);
  const controller = useRef<ReturnType<typeof createGitChanges> | null>(null);
  const [view, setView] = useState<"changes" | "history">("changes");
  const [history, setHistory] = useState(emptyHistory);
  const historyController = useRef<ReturnType<typeof createGitHistory> | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const selectedCommit = view === "history" ? history.selectedOid : null;
  const unstaged = unstagedEntries(changes.status);
  const staged = stagedEntries(changes.status);
  const selected = changes.selection;
  const busy = changes.writing || changes.loading;
  const applyLines = useRef<(() => void) | null>(null);
  const discardLines = useRef<(() => void) | null>(null);
  const commit = useRef<(() => void) | null>(null);
  const generator = useRef<CommitMessageGenerator | null>(null);
  const [generating, setGenerating] = useState(false);
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
        items: [
          { type: "action", id: "toggle-sidebar", label: sidebarLabel, shortcut: "Cmd+Ctrl+s" },
          { type: "separator" },
          { type: "action", id: "show-changes", label: "Changes", shortcut: "Cmd+1", disabled: !changes.root },
          { type: "action", id: "show-history", label: "History", shortcut: "Cmd+2", disabled: !changes.root },
        ],
      },
      {
        type: "submenu", id: "edit", label: "Edit", target: { menu: "edit" },
        items: [
          { type: "action", id: "copy-sha", label: "Copy SHA", shortcut: "Cmd+Shift+c", disabled: !selectedCommit },
          { type: "action", id: "open-github", label: "Open Commit on GitHub", disabled: !selectedCommit || !commitGitHubUrl(history, selectedCommit) },
        ],
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
          { type: "action", id: "generate-message", label: generating ? "Cancel Generating Commit Message" : "Generate Commit Message", shortcut: "Cmd+Alt+g", disabled: !generating && (busy || !staged.length || !!conflicts) },
          { type: "action", id: "commit", label: "Commit", shortcut: "Cmd+Enter", disabled: busy },
        ],
      },
    ],
    onAction: (action) => {
      if (action.itemId === "open-repository") void chooseRepository();
      if (action.itemId === "toggle-sidebar") setSidebarCollapsed(value => !value);
      if (action.itemId === "show-changes" && changes.root) setView("changes");
      if (action.itemId === "show-history" && changes.root) setView("history");
      if (action.itemId === "copy-sha" && selectedCommit) historyActions.copySha(selectedCommit);
      if (action.itemId === "open-github" && selectedCommit) historyActions.openOnGitHub(selectedCommit);
      if (action.itemId === "apply-lines") applyLines.current?.();
      if (action.itemId === "discard-file") void discardFile();
      if (action.itemId === "discard-lines") discardLines.current?.();
      if (action.itemId === "restore-discard") void restoreDiscard();
      if (action.itemId === "generate-message") generator.current?.toggle();
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
    historyController.current?.setRoot(changes.root);
    if (!changes.root) setView("changes");
  }, [changes.root]);
  useEffect(() => {
    if (view === "history") void historyController.current?.activate();
  }, [view, changes.root]);

  const [historyActions] = useState<HistoryActions>(() => ({
    select: oid => void historyController.current?.select(oid),
    loadMore: () => void historyController.current?.loadMore(),
    selectFile: path => historyController.current?.selectFile(path),
    copySha: oid => { setStringAsync(oid).catch(console.error); },
    openOnGitHub: oid => {
      const url = commitGitHubUrl(historyRef.current, oid);
      if (url) openURL(url).catch(console.error);
    },
    contextMenu: (oid, position) => {
      void historyController.current?.select(oid);
      const url = commitGitHubUrl(historyRef.current, oid);
      showContextMenu({ windowId: "main", position, items: [
        { type: "action", id: "copy-sha", label: "Copy SHA" },
        { type: "action", id: "open-github", label: "Open on GitHub", disabled: !url },
      ] }).then(result => {
        if (result.canceled) return;
        if (result.itemId === "copy-sha") historyActions.copySha(oid);
        if (result.itemId === "open-github") historyActions.openOnGitHub(oid);
      }, console.error);
    },
  }));

  useEffect(() => {
    void setWindowOptions("main", {
      title: changes.root ? `${changes.root.split("/").pop()} — Legend Git` : "Legend Git",
      appearance: "system",
      macos: {
        // Omitted, not null, without a repository: a null URI also clears the window title.
        ...(changes.root ? { representedUri: `file://${changes.root.split("/").map(encodeURIComponent).join("/")}` } : {}),
        titleBar: { contentLayout: "fullSize", transparent: true, titleVisibility: "visible" },
        toolbar: {
          visible: true,
          style: "unified",
          items: [
            { type: "button", id: "toggle-sidebar", label: sidebarLabel, symbol: "sidebar.left", placement: "leading", tooltip: sidebarLabel },
            { type: "button", id: "open-repository", label: "Open Repository…", symbol: "folder", tooltip: "Open Repository…" },
            { type: "button", id: "refresh", label: "Refresh", symbol: "arrow.clockwise", tooltip: "Refresh" },
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
    const historyOwner = createGitHistory(setHistory, watchDirectories);
    historyController.current = historyOwner;
    const registration = addMacOSWindowListener("main", event => {
      if (!disposed && event.type === "toolbarAction") {
        if (event.itemId === "refresh") { void owner.refresh(); void historyOwner.refresh(); }
        if (event.itemId === "restore-discard") void restoreRef.current();
        if (event.itemId === "toggle-sidebar") setSidebarCollapsed(value => !value);
        if (event.itemId === "open-repository") {
          void chooseRepository();
        }
      }
    });
    const closeRegistration = addWindowListener("main", "closed", () => {
      disposed = true;
      generator.current?.reset();
      owner.dispose();
      historyOwner.dispose();
      controller.current = null;
      historyController.current = null;
      void registration.then(listener => listener.remove()).catch(console.error);
      void closeRegistration.then(listener => listener.remove()).catch(console.error);
    });
    void registration.catch(console.error);
    void closeRegistration.catch(console.error);
    return () => {
      if (disposed) return;
      disposed = true;
      owner.dispose();
      historyOwner.dispose();
      controller.current = null;
      historyController.current = null;
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
        <Sidebar style={styles.root} selectedId={changes.root ? view : null} onSelectionChange={event => { if (event.id === "changes" || event.id === "history") setView(event.id); }} contentInsetTop={58}>
          <SidebarItem id="repositories" selectable={false}>
            <Text style={styles.section}>{changes.root?.split("/").pop() ?? "Repositories"}</Text>
          </SidebarItem>
          {changes.root ? [
            <SidebarItem key="changes" id="changes"><SidebarRow symbol="square.and.pencil" label="Changes" count={changes.status?.entries.length} /></SidebarItem>,
            <SidebarItem key="history" id="history"><SidebarRow symbol="clock" label="History" /></SidebarItem>,
          ] :
            <SidebarItem id="empty" selectable={false}><Text style={styles.sidebarNote}>No repository open</Text></SidebarItem>}
        </Sidebar>
      }
      content={
        <View style={styles.content}>
          {changes.error && <Text accessibilityRole="alert" selectable style={styles.error}>{changes.error}</Text>}
          {changes.root && view === "history" ? <View style={styles.history}>
            <HistoryView history={history} actions={historyActions} />
          </View> : changes.root ? <>
            <View style={styles.split}>
              <View style={styles.lists}>
                <ChangesList title="Unstaged" entries={unstaged} selectedPath={selected?.section === "unstaged" ? selected.path : null}
                  onSelect={path => void controller.current?.select(path === null ? null : { section: "unstaged", path })}
                  action="Stage" disabled={busy} onAction={path => void controller.current?.changeFile(path, true)}
                  secondaryAction="Discard…" secondaryDisabled={!canDiscardFile} onSecondaryAction={() => void discardFile()} />
                <ChangesList title="Staged" entries={staged} selectedPath={selected?.section === "staged" ? selected.path : null}
                  onSelect={path => void controller.current?.select(path === null ? null : { section: "staged", path })}
                  action="Unstage" disabled={busy} onAction={path => void controller.current?.changeFile(path, false)} />
                <CommitComposer disabled={busy} stagedCount={staged.length} conflictCount={conflicts} merging={changes.merging} unborn={changes.status?.branch.oid === "(initial)"} root={changes.root}
                  commitRef={commit} onCommit={input => controller.current?.commit(input) ?? Promise.resolve(false)} headMessage={() => controller.current?.headMessage() ?? Promise.resolve(null)}
                  readStaged={signal => controller.current?.stagedDiff(signal) ?? Promise.reject(new Error("Open a repository first."))}
                  confirmReplace={() => confirmDestructive("Replace the commit message?", "Replace", "The generated message replaces the summary and description you wrote.")}
                  generatorRef={generator} onGeneratingChange={setGenerating} />
              </View>
              {changes.patch ? <DiffPane patch={changes.patch} disabled={busy} applyRef={applyLines} discardRef={discardLines}
                onApply={(keys, text) => void controller.current?.changeLines(keys, text)}
                onDiscard={async (keys, text, what) => { if (await confirmDestructive(`Discard ${what}?`, "Discard")) await controller.current?.discardLines(keys, text); }} />
                : <View style={styles.placeholder}>{selected ? <EmptyState title="Loading Diff…" />
                  : unstaged.length || staged.length ? <EmptyState title="No Selection" message="Select a file to view its changes." />
                  : <EmptyState symbol="checkmark.circle" title="Working Tree Clean" message="There are no changes to commit." />}</View>}
            </View>
          </> : changes.loading ? <EmptyState title="Opening Repository…" />
            : <EmptyState symbol="folder" title="No Repository Open" message="Open a Git repository to see its changes and commit them.">
              <Button style={styles.open} onPress={() => void chooseRepository()}>Open Repository…</Button>
            </EmptyState>}
        </View>
      }
    />
  );
}

function SidebarRow({ symbol, label, count }: { symbol: string; label: string; count?: number }) {
  const color = useSymbolColor("blue");
  return <View style={styles.sidebarRow} accessible accessibilityLabel={count ? `${label}, ${count}` : label}>
    <View style={styles.sidebarIcon}><SFSymbol name={symbol} color={color} size={15} /></View>
    <Text style={styles.label} numberOfLines={1}>{label}</Text>
    {count ? <Text style={styles.count}>{count}</Text> : null}
  </View>;
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
  return <View style={[styles.listSection, title === "Staged" && styles.separated]}>
    <View style={styles.heading}>
      <Text style={styles.headingLabel} accessibilityRole="header">{title} ({entries.length})</Text>
      {secondaryAction ? <Button style={styles.discard} disabled={secondaryDisabled} onPress={() => onSecondaryAction?.()}>{secondaryAction}</Button> : null}
      <Button style={styles.action} disabled={disabled || selectedPath === null} onPress={() => { if (selectedPath !== null) onAction(selectedPath); }}>{action}</Button>
    </View>
    {entries.length ? <Sidebar style={styles.root} selectedId={selectedPath} onSelectionChange={event => onSelect(event.id)} defaultRowHeight={24}>
      {entries.map(entry => <SidebarItem key={entry.path} id={entry.path}><FileRow entry={entry} staged={title === "Staged"} /></SidebarItem>)}
    </Sidebar> : <View style={styles.emptyList}><Text style={styles.emptyListText}>No {title.toLowerCase()} changes</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingTop: 52, backgroundColor: PlatformColor("windowBackgroundColor") },
  history: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  split: { flex: 1, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  lists: { width: 340, backgroundColor: PlatformColor("controlBackgroundColor") },
  placeholder: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor") },
  open: { width: 150, height: 28 },
  listSection: { flex: 1 },
  separated: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingLeft: 16, paddingRight: 12 },
  headingLabel: { flex: 1, fontSize: 11, fontWeight: "600", color: PlatformColor("secondaryLabelColor") },
  action: { width: 72, height: 24 },
  discard: { width: 80, height: 24 },
  emptyList: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 24 },
  emptyListText: { fontSize: 12, color: PlatformColor("tertiaryLabelColor") },
  section: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4, fontSize: 11, fontWeight: "700", color: PlatformColor("tertiaryLabelColor") },
  sidebarRow: { height: 28, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  sidebarIcon: { width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 13, color: PlatformColor("labelColor") },
  count: { fontSize: 12, color: PlatformColor("secondaryLabelColor"), fontVariant: ["tabular-nums"] },
  sidebarNote: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
  error: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12, color: PlatformColor("systemRedColor") },
});

export default App;
