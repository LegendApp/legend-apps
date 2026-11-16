import { useEffect, useRef, useState } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { GitBranchNotMergedError, type GitRefList, type GitStatusEntry } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { conflictedEntries, createGitChanges, emptyChanges, stagedEntries, unstagedEntries } from "./gitChanges";
import { DiffPane, type DiffLineTarget } from "./DiffPane";
import { CommitDetails, HistoryList, type BlameTarget, type HistoryActions } from "./HistoryView";
import { commandEnabled, commandLabel, commandMenuItem, runCommand, sectionRef, type CommandContext, type CommandId, type Section } from "./commands";
import { createGitRefs, emptyRefs, findRef, recentBranches, resolveBranchName } from "./gitRefs";
import { commitGitHubUrl, createGitHistory, emptyHistory, searchScopes, type SearchScope } from "./gitHistory";
import { setStringAsync } from "@legendapp/spark/clipboard";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { openURL } from "@legendapp/spark/links";
import { EmptyState } from "./EmptyState";
import { FileRow, useSymbolColor } from "./FileRow";
import { CommitComposer, type CommitMessageGenerator } from "./CommitComposer";
import { openFileDialog, showMessage, showPrompt } from "@legendapp/spark/dialogs";
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
  const [searchScope, setSearchScope] = useState<SearchScope>("message");
  const [historyQuery, setHistoryQuery] = useState("");
  // Bumped when the app clears the search field (Show All), so the toolbar re-sends its text.
  const [searchEpoch, setSearchEpoch] = useState(0);
  // The diff line Blame Line acts on; the ref is current at once for a context menu opened in the same event.
  const [blameTarget, setBlameTargetState] = useState<BlameTarget | null>(null);
  const blameTargetRef = useRef<BlameTarget | null>(null);
  const setBlameTarget = (target: BlameTarget | null) => { blameTargetRef.current = target; setBlameTargetState(target); };
  const historyRef = useRef(history);
  historyRef.current = history;
  const [refs, setRefs] = useState(emptyRefs);
  const refsController = useRef<ReturnType<typeof createGitRefs> | null>(null);
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const root = changes.root;
  const showsHistory = section !== "changes";
  const selectedCommit = root && showsHistory ? history.selectedOid : null;
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

  /** Shows History for the line's file with the commit that last changed the line selected. */
  async function blameLine() {
    const target = blameTargetRef.current, owner = historyController.current, root = historyRef.current.root;
    if (!target || !owner) return;
    try {
      const hunk = await owner.blameLine(target.path, target.source, target.line);
      // Another repository opened while the blame ran.
      if (!hunk || historyController.current !== owner || historyRef.current.root !== root) return;
      if (!hunk.oid) {
        await showMessage({ windowId: "main", kind: "info", title: "Not Committed Yet", message: `Line ${target.line} of “${target.path}” has changes that are not committed yet.` });
        return;
      }
      showHistory();
      await owner.showFileHistory(target.path, hunk.oid);
    } catch (error) {
      if (error instanceof Error && error.name === "GitHistoryCancelledError") return;
      await showMessage({ windowId: "main", kind: "warning", title: "Couldn’t Blame the Line", message: error instanceof Error ? error.message : String(error) }).catch(console.error);
    }
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

  /** Shows HEAD's History now, so a file history started next isn't closed when History leaves a ref. */
  function showHistory() {
    historyController.current?.setRef(null);
    setSection("history");
  }

  /** Shows a branch write's failure (Git's own message) in a warning sheet. */
  const reportBranchError = (title: string, error: unknown) => showMessage({
    windowId: "main", kind: "warning", title,
    message: (error instanceof Error ? error.message : String(error)).replace(/^(error|fatal): /gm, "").trim(),
  }).catch(console.error);

  async function checkout(ref: string) {
    const entry = findRef(refsRef.current.refs, ref), owner = refsController.current;
    if (!entry || entry.kind === "tag" || !owner) return;
    try {
      const local = await owner.checkout(entry);
      // A selected remote branch gives way to the local branch made from it.
      if (entry.kind === "remote") setSection(current => current === `ref:${ref}` ? `ref:${local}` : current);
    } catch (error) { await reportBranchError(`Couldn’t Switch to “${entry.ref.name}”`, error); }
  }

  async function switchBranch() {
    const selectedRef = findRef(refsRef.current.refs, sectionRef(section));
    const result = await showPrompt({
      windowId: "main", title: "Switch Branch", message: "Enter the name of a local branch, or of a remote branch to check out as a new tracking branch.",
      placeholder: "Branch name", defaultValue: selectedRef && selectedRef.kind !== "tag" ? selectedRef.ref.name : undefined, confirmLabel: "Switch",
    }).catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    if (result.canceled || !result.value.trim()) return;
    const entry = resolveBranchName(refsRef.current.refs, result.value.trim());
    if (!entry) { await reportBranchError(`There’s No Branch Named “${result.value.trim()}”`, "Check the name, or pick a branch in the sidebar."); return; }
    await checkout(entry.ref.ref);
  }

  /** `start` is a ref name or commit id; HEAD when omitted. */
  async function newBranch(start?: string) {
    const owner = refsController.current;
    if (!owner) return;
    const entry = findRef(refsRef.current.refs, start);
    const from = entry ? `“${entry.ref.name}”` : start ? `commit ${start.slice(0, 7)}` : currentBranch ? `“${currentBranch}”` : "the current commit";
    const result = await showPrompt({ windowId: "main", title: "New Branch", message: `The new branch starts at ${from} and is checked out.`, placeholder: "Branch name", confirmLabel: "Create" })
      .catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    const name = result.canceled ? "" : result.value.trim();
    if (!name) return;
    try { await owner.create(name, start); } catch (error) { await reportBranchError("Couldn’t Create the Branch", error); }
  }

  async function renameBranch(ref: string) {
    const entry = findRef(refsRef.current.refs, ref), owner = refsController.current;
    if (entry?.kind !== "branch" || !owner) return;
    const result = await showPrompt({ windowId: "main", title: `Rename “${entry.ref.name}”`, message: "Enter a new name for the branch.", defaultValue: entry.ref.name, confirmLabel: "Rename" })
      .catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    const name = result.canceled ? "" : result.value.trim();
    if (!name || name === entry.ref.name) return;
    try {
      await owner.rename(entry.ref.name, name);
      setSection(current => current === `ref:${ref}` ? `ref:refs/heads/${name}` : current);
    } catch (error) { await reportBranchError(`Couldn’t Rename “${entry.ref.name}”`, error); }
  }

  /** Asks first; when Git refuses because the branch is not fully merged, asks again before `git branch -D`. */
  async function deleteBranch(ref: string) {
    const entry = findRef(refsRef.current.refs, ref), owner = refsController.current;
    if (entry?.kind !== "branch" || !owner) return;
    const name = entry.ref.name;
    if (!await confirmDestructive(`Delete the branch “${name}”?`, "Delete", "Its commits stay in the repository only while another branch or tag contains them.")) return;
    try {
      await owner.delete(name);
    } catch (error) {
      if (!(error instanceof GitBranchNotMergedError)) { await reportBranchError(`Couldn’t Delete “${name}”`, error); return; }
      const upstream = entry.ref.upstream;
      if (!await confirmDestructive(`“${name}” isn’t fully merged.`, "Delete Anyway", `It has commits that aren’t on ${upstream ? `its upstream “${upstream}”` : "the current branch"}. Deleting it may lose them.`, true)) return;
      try { await owner.delete(name, true); } catch (forced) { await reportBranchError(`Couldn’t Delete “${name}”`, forced); }
    }
  }

  const currentBranch = refs.refs?.branches.find(branch => branch.current)?.name ?? null;
  const context: CommandContext = {
    hasRepository: !!root,
    section,
    sidebarCollapsed,
    busy,
    selectedCommit,
    selectedFile: !root ? null : section === "changes" ? selected?.path ?? null : history.details?.selectedPath ?? null,
    fileHistoryPath: root ? history.file?.path ?? null : null,
    searching: root ? !!history.search : false,
    gitHubUrl: oid => commitGitHubUrl(historyRef.current, oid),
    canBlame: !!root && !!blameTarget,
    searchScope,
    canApplyLines: !!root && section === "changes" && !!changes.patch?.file?.hunks.length,
    linesLabel: `${selected?.section === "staged" ? "Unstage" : "Stage"} Selected Lines`,
    canDiscardFile: section === "changes" && canDiscardFile,
    canDiscardLines: section === "changes" && !busy && changes.patch?.section === "unstaged" && !!changes.patch.file?.hunks.length,
    canRestoreDiscard: !busy && !!lastDiscard,
    generating,
    canGenerate: !!root && section === "changes" && !busy && !!staged.length && !conflicts,
    canCommit: !!root && section === "changes" && !busy,
    refs: root ? refs.refs : null,
    unborn: !root || changes.status?.branch.oid === "(initial)",
    branchBusy: refs.writing,
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
      showFileHistory: path => { showHistory(); void historyController.current?.showFileHistory(path); },
      closeFileHistory: () => {
        historyController.current?.closeFileHistory();
        if (historyQuery) { setHistoryQuery(""); setSearchEpoch(value => value + 1); }
      },
      blameLine: () => void blameLine(),
      compareWith: oid => void historyController.current?.compare(oid),
      setSearchScope: scope => {
        setSearchScope(scope);
        if (historyQuery) historyController.current?.search(scope, historyQuery);
      },
      applyLines: () => applyLines.current?.(),
      discardFile: () => void discardFile(),
      discardLines: () => discardLines.current?.(),
      restoreDiscard: () => void restoreDiscard(),
      toggleGenerate: () => generator.current?.toggle(),
      commit: () => commit.current?.(),
      checkout: ref => void checkout(ref),
      switchBranch: () => void switchBranch(),
      newBranch: start => void newBranch(start),
      renameBranch: ref => void renameBranch(ref),
      deleteBranch: ref => void deleteBranch(ref),
      copyText: text => { setStringAsync(text).catch(console.error); },
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
      { type: "submenu", id: "edit", label: "Edit", target: { menu: "edit" }, items: [item("copy-sha"), { type: "separator" }, item("blame-line")] },
      // AppKit's own View ▸ Show/Hide Sidebar drives the split view, so the menu has no second one.
      { type: "submenu", id: "view", label: "View", target: { menu: "view" }, items: [item("show-changes"), item("show-history"), { type: "separator" }, item("show-file-history"), item("show-all-history")] },
      { type: "submenu", id: "repository", label: "Repository", placement: { before: { menu: "window" } }, items: [item("refresh"), { type: "separator" }, item("open-github")] },
      { type: "submenu", id: "branch", label: "Branch", placement: { before: { menu: "window" } }, items: [item("switch-branch"), item("new-branch"), { type: "separator" }, item("rename-branch"), item("delete-branch")] },
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

  // A search ended by something other than the field (a file's history, a blame) clears the field too.
  useEffect(() => {
    if (!history.search && historyQuery) { setHistoryQuery(""); setSearchEpoch(value => value + 1); }
  }, [history.search]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the search ends
  useEffect(() => {
    historyController.current?.setRoot(root);
    refsController.current?.setRoot(root);
    if (!root) setSection("changes");
  }, [root]);
  // Changes re-reads status on every ref or HEAD change its watcher sees; the refs follow it.
  useEffect(() => { if (changes.status) void refsController.current?.refresh(); }, [changes.status]);
  useEffect(() => {
    if (section === "changes") return;
    historyController.current?.setRef(sectionRef(section));
    void historyController.current?.activate();
  }, [section, root]);
  // A selected ref that was deleted or renamed elsewhere falls back to History.
  useEffect(() => {
    const ref = sectionRef(section);
    if (ref && refs.refs && !findRef(refs.refs, ref)) setSection("history");
  }, [refs.refs, section]);

  const [historyActions] = useState<HistoryActions>(() => ({
    select: oid => void historyController.current?.select(oid),
    loadMore: () => void historyController.current?.loadMore(),
    selectFile: path => historyController.current?.selectFile(path),
    copySha: oid => { runCommand("copy-sha", contextRef.current, oid); },
    openOnGitHub: oid => { runCommand("open-github", contextRef.current, oid); },
    contextMenu: (oid, position) => {
      const menuContext = contextRef.current;
      // The row keeps the selection, so Compare with Selected can compare the two.
      const items = [
        commandMenuItem("compare-with-selected", menuContext, { target: oid, shortcut: false }), { type: "separator" as const },
        { ...commandMenuItem("new-branch", menuContext, { target: oid, shortcut: false }), label: "New Branch from Commit…" }, { type: "separator" as const },
        ...(["copy-sha", "open-github"] as const).map(id => commandMenuItem(id, menuContext, { target: oid, shortcut: false })),
      ];
      showContextMenu({ windowId: "main", position, items })
        .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, oid); }, console.error);
    },
    fileContextMenu: (path, position) => { historyController.current?.selectFile(path); showFileMenu(path, position); },
    closeFileHistory: () => { runCommand("show-all-history", contextRef.current); },
    compare: oid => void historyController.current?.compare(oid),
    swapCompare: () => void historyController.current?.swapCompare(),
    closeCompare: () => historyController.current?.closeCompare(),
    lineChange: target => setBlameTarget(target),
    lineContextMenu: (target, position) => showLineMenu(target, position),
  }));

  function showLineMenu(target: BlameTarget, position: { x: number; y: number }) {
    setBlameTarget(target);
    showContextMenu({ windowId: "main", position, items: [commandMenuItem("blame-line", { ...contextRef.current, canBlame: true }, { shortcut: false })] })
      .then(result => { if (!result.canceled) runCommand(result.itemId, { ...contextRef.current, canBlame: !!blameTargetRef.current }); }, console.error);
  }

  /** Changes blames added and context lines as on disk (unstaged) or staged, and removed lines one step older. */
  const changesBlameTarget = (target: DiffLineTarget | null): BlameTarget | null => {
    const staged = changes.patch?.section === "staged";
    return target && { ...target, source: target.side === "new" ? staged ? "index" : "workdir" : staged ? "HEAD" : "index" };
  };

  function showFileMenu(path: string, position: { x: number; y: number }) {
    showContextMenu({ windowId: "main", position, items: [commandMenuItem("show-file-history", contextRef.current, { target: path, shortcut: false })] })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, path); }, console.error);
  }

  function showRefMenu({ ref, position }: { ref: string; position: { x: number; y: number } }) {
    const menuContext = contextRef.current;
    const entry = findRef(menuContext.refs, ref);
    if (!entry) return;
    const ids: (CommandId | null)[] = entry.kind === "branch" ? ["checkout-ref", "new-branch", null, "rename-branch", "delete-branch", null, "copy-ref-name"]
      : entry.kind === "remote" ? ["checkout-ref", "new-branch", null, "copy-ref-name"] : ["new-branch", null, "copy-ref-name"];
    const items = ids.map(id => id ? { ...commandMenuItem(id, menuContext, { target: ref, shortcut: false }), ...id === "new-branch" ? { label: `New Branch from “${entry.ref.name}”…` } : {} } : { type: "separator" as const });
    showContextMenu({ windowId: "main", position, items })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, ref); }, console.error);
  }

  // A ref deleted or renamed since it was selected has no row; History is shown until the effect above moves there.
  const sidebarSection = sectionRef(section) && !findRef(refs.refs, sectionRef(section)) ? "history" : section;
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
        ...recentBranches(context.refs).map(branch => ({ type: "checkbox" as const, id: `checkout:${branch.ref}`, label: branch.name, checked: branch.current, disabled: branch.current || !commandEnabled("checkout-ref", context, branch.ref) && !branch.current })),
        ...context.refs?.branches.length ? [{ type: "separator" as const }] : [],
        commandMenuItem("switch-branch", context, { shortcut: false }),
        commandMenuItem("new-branch", context, { shortcut: false }),
      ] },
      { type: "segmented", id: "section", label: "View", value: showsHistory && section !== "history" ? null : section, segments: [
        { value: "changes", label: "Changes", symbol: "square.and.pencil" },
        { value: "history", label: "History", symbol: "clock" },
      ] },
      // Fetch, Pull and Push arrive with M3: a `disabled` toolbar button still shows and acts enabled (Spark ask), so they are left out until then.
      button("refresh", "arrow.clockwise"),
      // AppKit's NSSearchToolbarItem (it collapses itself when the toolbar is narrow); Spark's `collapses` button ignores real clicks (Spark ask).
      { type: "search", id: "search", label: "Search", placeholder: section === "changes" ? "Filter Files" : "Search Commits", width: 200 },
      ...showsHistory ? [{
        type: "menu" as const, id: "search-scope", label: searchScopes.find(entry => entry.scope === searchScope)!.label, tooltip: "Search in",
        items: searchScopes.map(({ scope, label }) => ({ type: "checkbox" as const, id: `search-${scope}`, label, checked: scope === searchScope })),
      }] : [],
    ] satisfies MacOSToolbarItem[] : [],
  ];
  // The search field keeps its own text; it is passed only when the toolbar is rebuilt (a section switch or Show All).
  const searchText = showsHistory ? historyQuery : filter;
  const toolbar = { visible: true, style: "unified" as const, items: toolbarItems.map(entry => entry.type === "search" ? { ...entry, value: searchText } : entry) };
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
  const toolbarKey = JSON.stringify([toolbarItems, searchEpoch]);
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
    const refsOwner = createGitRefs(setRefs);
    refsController.current = refsOwner;
    const registration = addMacOSWindowListener("main", event => {
      if (disposed) return;
      if (event.type === "toolbarAction") runCommand(event.itemId, contextRef.current);
      else if (event.type === "toolbarMenuAction") {
        const { itemId } = event.action;
        if (itemId.startsWith("checkout:")) runCommand("checkout-ref", contextRef.current, itemId.slice(9));
        else runCommand(itemId, contextRef.current);
      }
      else if (event.type === "toolbarSelectionChanged" && event.itemId === "section") runCommand(event.value === "history" ? "show-history" : "show-changes", contextRef.current);
      // Typing already filters or searches. AppKit also sends the field's action when the field loses focus (a click
      // on Show All, a section switch), with the text from before, so submits are ignored.
      else if (event.type === "toolbarSearchChanged") {
        if (contextRef.current.section === "changes") setFilter(event.value);
        else {
          setHistoryQuery(event.value);
          historyOwner.search(contextRef.current.searchScope, event.value);
        }
      }
    });
    const closeRegistration = addWindowListener("main", "closed", () => {
      disposed = true;
      generator.current?.reset();
      owner.dispose();
      historyOwner.dispose();
      refsOwner.dispose();
      controller.current = null;
      historyController.current = null;
      refsController.current = null;
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
      refsOwner.dispose();
      controller.current = null;
      historyController.current = null;
      refsController.current = null;
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
    onLineChange={target => setBlameTarget(changesBlameTarget(target))}
    onLineContextMenu={(target, position) => { const blame = changesBlameTarget(target); if (blame) showLineMenu(blame, position); }}
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
        <Sidebar style={styles.root} selectedId={root ? sidebarSection : null} onSelectionChange={event => { if (event.id === "changes" || event.id === "history" || event.id?.startsWith("ref:")) setSection(event.id as Section); }} contentInsetTop={58}>
          <SidebarItem id="repositories" selectable={false}>
            <Text style={styles.section}>{root?.split("/").pop() ?? "Repositories"}</Text>
          </SidebarItem>
          {root ? [
            <SidebarItem key="changes" id="changes"><SidebarRow symbol="square.and.pencil" label="Changes" count={changes.status?.entries.length} /></SidebarItem>,
            <SidebarItem key="history" id="history"><SidebarRow symbol="clock" label="History" /></SidebarItem>,
            ...refSidebarItems(refs.refs, ref => showRefMenu(ref)),
          ] :
            <SidebarItem id="empty" selectable={false}><Text style={styles.sidebarNote}>No repository open</Text></SidebarItem>}
        </Sidebar>
      }
      list={root ? <>
        {changesList}
        {showsHistory ? <View style={styles.listPane}><HistoryList history={history} actions={historyActions} /></View> : null}
      </> : undefined}
      content={
        <View style={styles.content}>
          {changes.error ? <Text accessibilityRole="alert" selectable style={styles.error}>{changes.error}</Text> : null}
          {root ? <View style={styles.detail}>{showsHistory ? <CommitDetails history={history} actions={historyActions} /> : changesDetail}</View>
            : changes.loading ? <EmptyState title="Opening Repository…" />
            : <EmptyState symbol="folder" title="No Repository Open" message="Open a Git repository to see its changes and commit them.">
              <Button style={styles.open} onPress={() => void chooseRepository()}>Open Repository…</Button>
            </EmptyState>}
        </View>
      }
    />
  );
}

function SidebarRow({ symbol, label, count, current, indent }: { symbol: string; label: string; count?: number; current?: boolean; indent?: boolean }) {
  const color = useSymbolColor("blue");
  const secondary = useSymbolColor("secondary");
  return <View style={[styles.sidebarRow, indent && styles.indented]} accessible accessibilityLabel={count ? `${label}, ${count}` : current ? `${label}, current branch` : label}>
    <View style={styles.sidebarIcon}><SFSymbol name={symbol} color={color} size={15} /></View>
    <Text style={styles.label} numberOfLines={1}>{label}</Text>
    {count ? <Text style={styles.count}>{count}</Text> : null}
    {current ? <SFSymbol name="checkmark" color={secondary} size={12} /> : null}
  </View>;
}

/** Branches, Remotes (each remote, then its branches) and Tags, each under a group row; an empty section is left out. */
function refSidebarItems(refs: GitRefList | null, onContextMenu: (event: { ref: string; position: { x: number; y: number } }) => void) {
  if (!refs) return [];
  const row = (ref: string, symbol: string, label: string, options: { current?: boolean; indent?: boolean } = {}) =>
    <SidebarItem key={ref} id={`ref:${ref}`} onContextMenu={event => onContextMenu({ ref, position: event.windowPosition })}>
      <SidebarRow symbol={symbol} label={label} current={options.current} indent={options.indent} />
    </SidebarItem>;
  const group = (id: string, title: string) => <SidebarItem key={id} id={id} selectable={false}><Text style={styles.section} accessibilityRole="header">{title}</Text></SidebarItem>;
  const remotes = refs.remotes.filter(remote => remote.branches.length);
  return [
    ...refs.branches.length ? [group("group:branches", "Branches"), ...refs.branches.map(branch => row(branch.ref, "arrow.triangle.branch", branch.name, { current: branch.current }))] : [],
    ...remotes.length ? [group("group:remotes", "Remotes"), ...remotes.flatMap(remote => [
      <SidebarItem key={`remote:${remote.name}`} id={`remote:${remote.name}`} selectable={false}><SidebarRow symbol="network" label={remote.name} /></SidebarItem>,
      ...remote.branches.map(branch => row(branch.ref, "arrow.triangle.branch", branch.branch, { indent: true })),
    ])] : [],
    ...refs.tags.length ? [group("group:tags", "Tags"), ...refs.tags.map(tag => row(tag.ref, "tag", tag.name))] : [],
  ];
}

/**
 * A native warning sheet on the main window; resolves true when the user picks the action. With `safeDefault`,
 * Return picks Cancel (for actions that can lose work without a backup).
 */
async function confirmDestructive(title: string, action: string, message = "Legend Git saves a backup first. Use Changes ▸ Restore Last Discard to bring the changes back.", safeDefault = false) {
  try {
    const result = await showMessage({ windowId: "main", kind: "warning", title, message, buttons: [{ id: "confirm", label: action }, { id: "cancel", label: "Cancel" }], defaultButtonId: safeDefault ? "cancel" : "confirm", cancelButtonId: "cancel" });
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
  indented: { paddingLeft: 24 },
  sidebarIcon: { width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 13, color: PlatformColor("labelColor") },
  count: { fontSize: 12, color: PlatformColor("secondaryLabelColor"), fontVariant: ["tabular-nums"] },
  sidebarNote: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
  error: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12, color: PlatformColor("systemRedColor") },
});

export default App;
