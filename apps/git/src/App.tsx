import { useEffect, useRef, useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import type { GitStatusEntry } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { conflictedEntries, createGitChanges, emptyChanges, stagedEntries, unstagedEntries } from "./gitChanges";
import { DiffPane } from "./DiffPane";
import { CommitDetails, HistoryList, type HistoryActions } from "./HistoryView";
import { commandEnabled, commandLabel, commandMenuItem, runCommand, type CommandContext, type CommandId, type Section } from "./commands";
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
import { addMacOSWindowListener, type MacOSToolbarItem } from "@legendapp/spark/windows/macos";

const contentInset = 52;

export function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [changes, setChanges] = useState(emptyChanges);
  const controller = useRef<ReturnType<typeof createGitChanges> | null>(null);
  const [section, setSection] = useState<Section>("changes");
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState(emptyHistory);
  const historyController = useRef<ReturnType<typeof createGitHistory> | null>(null);
  const historyRef = useRef(history);
  historyRef.current = history;
  const root = changes.root;
  const selectedCommit = root && section === "history" ? history.selectedOid : null;
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
  // The selected file stays listed while filtering, so Stage/Unstage/Discard never act on a hidden row.
  const matches = (section: "unstaged" | "staged") => (entry: GitStatusEntry) => !filter
    || (selected?.section === section && selected.path === entry.path)
    || entry.path.split("/").pop()!.toLowerCase().includes(filter.toLowerCase());

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

  const context: CommandContext = {
    hasRepository: !!root,
    section,
    sidebarCollapsed,
    busy,
    selectedCommit,
    selectedFile: !root ? null : section === "changes" ? selected?.path ?? null : history.details?.selectedPath ?? null,
    fileHistoryPath: root ? history.file?.path ?? null : null,
    gitHubUrl: oid => commitGitHubUrl(historyRef.current, oid),
    canApplyLines: !!root && section === "changes" && !!changes.patch?.file?.hunks.length,
    linesLabel: `${selected?.section === "staged" ? "Unstage" : "Stage"} Selected Lines`,
    canDiscardFile: section === "changes" && canDiscardFile,
    canDiscardLines: section === "changes" && !busy && changes.patch?.section === "unstaged" && !!changes.patch.file?.hunks.length,
    canRestoreDiscard: !busy && !!lastDiscard,
    generating,
    canGenerate: !!root && section === "changes" && !busy && !!staged.length && !conflicts,
    canCommit: !!root && section === "changes" && !busy,
    run: {
      openRepository: () => void chooseRepository(),
      toggleSidebar: () => setSidebarCollapsed(value => !value),
      showSection: setSection,
      refresh: () => { void controller.current?.refresh(); void historyController.current?.refresh(); },
      copySha: oid => { setStringAsync(oid).catch(console.error); },
      openOnGitHub: oid => {
        const url = commitGitHubUrl(historyRef.current, oid);
        if (url) openURL(url).catch(console.error);
      },
      showFileHistory: path => { setSection("history"); void historyController.current?.showFileHistory(path); },
      closeFileHistory: () => historyController.current?.closeFileHistory(),
      applyLines: () => applyLines.current?.(),
      discardFile: () => void discardFile(),
      discardLines: () => discardLines.current?.(),
      restoreDiscard: () => void restoreDiscard(),
      toggleGenerate: () => generator.current?.toggle(),
      commit: () => commit.current?.(),
    },
  };
  const contextRef = useRef(context);
  contextRef.current = context;
  const item = (id: CommandId) => commandMenuItem(id, context);

  useMenu({
    id: "legend-git",
    items: [
      { type: "submenu", id: "app", label: "Legend Git", target: { menu: "app" }, items: [] },
      { type: "submenu", id: "file", label: "File", target: { menu: "file" }, items: [item("open-repository")] },
      { type: "submenu", id: "edit", label: "Edit", target: { menu: "edit" }, items: [item("copy-sha")] },
      // AppKit's own View ▸ Show/Hide Sidebar drives the split view, so the menu has no second one.
      { type: "submenu", id: "view", label: "View", target: { menu: "view" }, items: [item("show-changes"), item("show-history"), { type: "separator" }, item("show-file-history"), item("show-all-history")] },
      { type: "submenu", id: "repository", label: "Repository", placement: { before: { menu: "window" } }, items: [item("refresh"), { type: "separator" }, item("open-github")] },
      {
        type: "submenu", id: "changes", label: "Changes", placement: { before: { menu: "window" } },
        items: [
          item("apply-lines"), { type: "separator" },
          item("discard-file"), item("discard-lines"), item("restore-discard"), { type: "separator" },
          item("generate-message"), item("commit"),
        ],
      },
    ],
    onAction: action => { runCommand(action.itemId, contextRef.current); },
  });

  useEffect(() => {
    historyController.current?.setRoot(root);
    if (!root) setSection("changes");
  }, [root]);
  useEffect(() => {
    if (section === "history") void historyController.current?.activate();
  }, [section, root]);

  const [historyActions] = useState<HistoryActions>(() => ({
    select: oid => void historyController.current?.select(oid),
    loadMore: () => void historyController.current?.loadMore(),
    selectFile: path => historyController.current?.selectFile(path),
    copySha: oid => { runCommand("copy-sha", contextRef.current, oid); },
    openOnGitHub: oid => { runCommand("open-github", contextRef.current, oid); },
    contextMenu: (oid, position) => {
      void historyController.current?.select(oid);
      const menuContext = contextRef.current;
      showContextMenu({ windowId: "main", position, items: (["copy-sha", "open-github"] as const).map(id => commandMenuItem(id, menuContext, { target: oid, shortcut: false })) })
        .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, oid); }, console.error);
    },
    fileContextMenu: (path, position) => { historyController.current?.selectFile(path); showFileMenu(path, position); },
    closeFileHistory: () => { runCommand("show-all-history", contextRef.current); },
  }));

  function showFileMenu(path: string, position: { x: number; y: number }) {
    showContextMenu({ windowId: "main", position, items: [commandMenuItem("show-file-history", contextRef.current, { target: path, shortcut: false })] })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, path); }, console.error);
  }

  const branch = changes.status?.branch;
  const branchLabel = !branch?.head ? null : branch.head === "(detached)" ? `${branch.oid?.slice(0, 7) ?? "HEAD"} (detached)` : branch.head;
  const button = (id: CommandId, symbol: string) => {
    const label = commandLabel(id, context);
    return { type: "button" as const, id, label, symbol, tooltip: label, disabled: !commandEnabled(id, context) };
  };
  const toolbarItems: MacOSToolbarItem[] = [
    { ...button("toggle-sidebar", "sidebar.left"), placement: "leading" },
    ...root ? [
      { type: "menu", id: "branch", label: branchLabel ?? "Branch", symbol: "arrow.triangle.branch", placement: "leading", tooltip: "Current branch", items: [
        { type: "action", id: "switch-branch", label: "Switch Branch…", disabled: true },
        { type: "action", id: "new-branch", label: "New Branch…", disabled: true },
      ] },
      { type: "segmented", id: "section", label: "View", value: section, segments: [
        { value: "changes", label: "Changes", symbol: "square.and.pencil" },
        { value: "history", label: "History", symbol: "clock" },
      ] },
      // Fetch, Pull and Push arrive with M3: a `disabled` toolbar button still shows and acts enabled (Spark ask), so they are left out until then.
      button("refresh", "arrow.clockwise"),
      // AppKit's NSSearchToolbarItem (it collapses itself when the toolbar is narrow); Spark's `collapses` button ignores real clicks (Spark ask).
      { type: "search", id: "search", label: "Search", placeholder: section === "changes" ? "Filter Files" : "Search", width: 200, disabled: section !== "changes" },
    ] satisfies MacOSToolbarItem[] : [],
  ];
  // The search field keeps its own text; it is passed only when the toolbar is rebuilt for another reason.
  const toolbar = { visible: true, style: "unified" as const, items: toolbarItems.map(entry => entry.type === "search" && filter ? { ...entry, value: filter } : entry) };
  const toolbarRef = useRef(toolbar);
  toolbarRef.current = toolbar;
  // Title bar options go once: re-sending them grows the window by 20 pt each time (Spark ask).
  useEffect(() => {
    void setWindowOptions("main", { appearance: "system", macos: { titleBar: { contentLayout: "fullSize", transparent: true, titleVisibility: "visible" } } }).catch(console.error);
  }, []);
  useEffect(() => {
    void setWindowOptions("main", {
      title: root ? `${root.split("/").pop()} — Legend Git` : "Legend Git",
      macos: {
        // Omitted, not null, without a repository: a null URI also clears the window title.
        ...(root ? { representedUri: `file://${root.split("/").map(encodeURIComponent).join("/")}` } : {}),
        toolbar: toolbarRef.current,
      },
    }).catch(console.error);
  }, [root]);
  // Item changes (section, labels, availability) update only the toolbar.
  const toolbarKey = JSON.stringify(toolbarItems);
  const toolbarShown = useRef(toolbarKey);
  useEffect(() => {
    if (toolbarShown.current === toolbarKey) return;
    toolbarShown.current = toolbarKey;
    void setWindowOptions("main", { macos: { toolbar: toolbarRef.current } }).catch(console.error);
  }, [toolbarKey]);

  useEffect(() => {
    let disposed = false;
    const owner = createGitChanges(setChanges, watchDirectories);
    controller.current = owner;
    const historyOwner = createGitHistory(setHistory, watchDirectories);
    historyController.current = historyOwner;
    const registration = addMacOSWindowListener("main", event => {
      if (disposed) return;
      if (event.type === "toolbarAction") runCommand(event.itemId, contextRef.current);
      else if (event.type === "toolbarMenuAction") runCommand(event.action.itemId, contextRef.current);
      else if (event.type === "toolbarSelectionChanged" && event.itemId === "section") runCommand(event.value === "history" ? "show-history" : "show-changes", contextRef.current);
      else if ((event.type === "toolbarSearchChanged" || event.type === "toolbarSearchSubmitted") && contextRef.current.section === "changes") setFilter(event.value);
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

  // Stays mounted (hidden) in History so the commit message draft and a running generation survive a section switch.
  const changesList = <View style={[styles.listPane, section !== "changes" && styles.hidden]}>
    <ChangesList title="Unstaged" entries={unstaged.filter(matches("unstaged"))} filtered={!!filter} selectedPath={selected?.section === "unstaged" ? selected.path : null}
      onSelect={path => void controller.current?.select(path === null ? null : { section: "unstaged", path })}
      action="Stage" disabled={busy} onAction={path => void controller.current?.changeFile(path, true)} onContextMenu={showFileMenu}
      secondaryAction="Discard…" secondaryDisabled={!canDiscardFile} onSecondaryAction={() => void discardFile()} />
    <ChangesList title="Staged" entries={staged.filter(matches("staged"))} filtered={!!filter} selectedPath={selected?.section === "staged" ? selected.path : null}
      onSelect={path => void controller.current?.select(path === null ? null : { section: "staged", path })}
      action="Unstage" disabled={busy} onAction={path => void controller.current?.changeFile(path, false)} onContextMenu={showFileMenu} />
    <CommitComposer disabled={busy} stagedCount={staged.length} conflictCount={conflicts} merging={changes.merging} unborn={changes.status?.branch.oid === "(initial)"} root={root!}
      commitRef={commit} onCommit={input => controller.current?.commit(input) ?? Promise.resolve(false)} headMessage={() => controller.current?.headMessage() ?? Promise.resolve(null)}
      readStaged={signal => controller.current?.stagedDiff(signal) ?? Promise.reject(new Error("Open a repository first."))}
      confirmReplace={() => confirmDestructive("Replace the commit message?", "Replace", "The generated message replaces the summary and description you wrote.")}
      generatorRef={generator} onGeneratingChange={setGenerating} />
  </View>;

  const changesDetail = changes.patch ? <DiffPane patch={changes.patch} disabled={busy} applyRef={applyLines} discardRef={discardLines}
    onApply={(keys, text) => void controller.current?.changeLines(keys, text)}
    onDiscard={async (keys, text, what) => { if (await confirmDestructive(`Discard ${what}?`, "Discard")) await controller.current?.discardLines(keys, text); }} />
    : selected ? <EmptyState title="Loading Diff…" />
    : unstaged.length || staged.length ? <EmptyState title="No Selection" message="Select a file to view its changes." />
    : <EmptyState symbol="checkmark.circle" title="Working Tree Clean" message="There are no changes to commit." />;

  return (
    <SidebarSplitView
      appearance="system"
      style={styles.root}
      sidebarWidth={220}
      sidebarMinWidth={180}
      listWidth={320}
      listMinWidth={260}
      contentMinWidth={480}
      sidebarCollapsed={sidebarCollapsed}
      onSidebarCollapsedChange={setSidebarCollapsed}
      titleBar={{ content: { height: contentInset, material: "titlebar" } }}
      sidebar={
        <Sidebar style={styles.root} selectedId={root ? section : null} onSelectionChange={event => { if (event.id === "changes" || event.id === "history") setSection(event.id); }} contentInsetTop={58}>
          <SidebarItem id="repositories" selectable={false}>
            <Text style={styles.section}>{root?.split("/").pop() ?? "Repositories"}</Text>
          </SidebarItem>
          {root ? [
            <SidebarItem key="changes" id="changes"><SidebarRow symbol="square.and.pencil" label="Changes" count={changes.status?.entries.length} /></SidebarItem>,
            <SidebarItem key="history" id="history"><SidebarRow symbol="clock" label="History" /></SidebarItem>,
          ] :
            <SidebarItem id="empty" selectable={false}><Text style={styles.sidebarNote}>No repository open</Text></SidebarItem>}
        </Sidebar>
      }
      list={root ? <>
        {changesList}
        {section === "history" ? <View style={styles.listPane}><HistoryList history={history} actions={historyActions} /></View> : null}
      </> : undefined}
      content={
        <View style={styles.content}>
          {changes.error ? <Text accessibilityRole="alert" selectable style={styles.error}>{changes.error}</Text> : null}
          {root ? <View style={styles.detail}>{section === "history" ? <CommitDetails history={history} actions={historyActions} /> : changesDetail}</View>
            : changes.loading ? <EmptyState title="Opening Repository…" />
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

function ChangesList({ title, entries, filtered, selectedPath, onSelect, onContextMenu, action, disabled, onAction, secondaryAction, secondaryDisabled, onSecondaryAction }: {
  title: string; entries: GitStatusEntry[]; filtered: boolean; selectedPath: string | null; onSelect: (path: string | null) => void;
  onContextMenu: (path: string, position: { x: number; y: number }) => void;
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
      {entries.map(entry => <SidebarItem key={entry.path} id={entry.path} onContextMenu={event => onContextMenu(entry.path, event.windowPosition)}><FileRow entry={entry} staged={title === "Staged"} /></SidebarItem>)}
    </Sidebar> : <View style={styles.emptyList}><Text style={styles.emptyListText}>{filtered ? "No matching files" : `No ${title.toLowerCase()} changes`}</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingTop: contentInset, backgroundColor: PlatformColor("windowBackgroundColor") },
  detail: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor") },
  listPane: { flex: 1, paddingTop: contentInset, backgroundColor: PlatformColor("controlBackgroundColor") },
  hidden: { display: "none" },
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
