import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { PlatformColor, ScrollView, StyleSheet, Text, View } from "react-native";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { GitBranchNotMergedError, GitLocalChangesError, GitPullDivergedError, GitPushedCommitsError, GitPushRejectedError, GitServiceError, GitStashDropError, type GitConflictFile, type GitInteractiveRebasePlan, type GitTodoEntry, type GitConflictSide, type GitRefList, type GitStash, type GitStatusEntry } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { conflictSides, conflictedEntries, createGitChanges, emptyChanges, stagedEntries, unstagedEntries } from "./gitChanges";
import { DiffPane, PickButton, type DiffLineTarget } from "./DiffPane";
import { applyColumnMenu, columnMenuItems, CommitFileDiff, CommitFiles, CommitInfo, HistoryList, type BlameTarget, type HistoryActions } from "./HistoryView";
import { LayoutHost, type PanelRenderers } from "./layout/LayoutHost";
import { DiffDocumentCacheContext } from "./layout/diffDocuments";
import { layoutMenu, runLayoutAction } from "./layout/layoutMenu";
import { diffMenu, runDiffAction } from "./layout/diffMenu";
import { activeLayoutName, activePaneSizes, planPanels, viewKindFor, windowPlan, type LayoutConditions } from "./layout/plan";
import { isDividerResize } from "./layout/paneSizes";
import { useWindowLayout } from "./layout/useWindowLayout";
import type { PanelId } from "./settings/schema";
import { activeLayout } from "./settings/presets";
import { contextMenuItems, menuCommandIds, menuCommandTarget, resolveKeyBindings, routedBindings, toolbarItems, toolbarSlots, type MenuSubject } from "./actions";
import { commandEnabled, commandLabel, commandMenuItem, queueEntry, runCommand, sectionPullRequest, sectionRef, sectionReview, sectionShowsHistory, sectionStash, sectionWorktree, type CommandContext, type CommandId, type Section } from "./commands";
import { queueDetail, queuePushTarget, reviewQueue, type QueueEntry } from "./gitQueue";
import { createGitRefs, emptyRefs, findRef, recentBranches, resolveBranchName, type WorktreeEntry } from "./gitRefs";
import { createWorktreePreview, emptyWorktreePreview, worktreeDetail, worktreeName, type WorktreePreviewState } from "./gitWorktrees";
import { closeMenuWindow, mainWindowId, registerMenuRunner, runMenuAction, useMenuBar, openSettingsWindow, openWorktreePaths, openWorktreeWindow, publishMenu, setMenuWindow, type GitWindowProps } from "./gitWindows";
import { runCommand as runProcess } from "@legendapp/spark/processes";
import { commitGitHubUrl, createGitHistory, emptyHistory } from "./gitHistory";
import { historyQueryHint } from "./historyQuery";
import { createGitNetwork, emptyNetwork, networkStatusText, networkVerb, type NetworkOperation } from "./gitNetwork";
import { createStashPreview, emptyStashPreview, sidebarDate, stashLabel, type StashPreviewState } from "./gitStashes";
import { setStringAsync } from "@legendapp/spark/clipboard";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { openURL } from "@legendapp/spark/links";
import { subscribeToOpenRequests } from "@legendapp/spark/app/documents";
import { EmptyState } from "./EmptyState";
import { gitHubAccount, gitHubCliToken, useGitHubAccount } from "./gitHubAccount";
import { createPullRequests, emptyPullRequests, pullRequestBases, pullRequestBranch, pushedAs, type PullRequestsState } from "./gitPullRequests";
import { CreatePullRequestSheet, type PullRequestInput } from "./CreatePullRequestSheet";
import { InteractiveRebaseSheet } from "./InteractiveRebaseSheet";
import { GitHubError, reviewSummary, type GitHubPullRequest, type ReviewEvent, type ReviewThread } from "./github";
import { commentCounts, commentRange, placeThreads, threadLines } from "./reviewThreads";
import { CommentSheet, ReviewThreadView } from "./ReviewThreadView";
import { StateBar } from "./StateBar";
import { abortLabel, abortWarning, canContinue, conflictPickable, conflictSideName, operationText } from "./gitOperation";
import { recentLabels, recentRepositories, useRecentRepositories } from "./gitRecents";
import { FileRow, fileStatus, pathParts, useSymbolColor } from "./FileRow";
import { folderItem, useFileList } from "./fileList";
import { CommitComposer, type CommitMessageGenerator } from "./CommitComposer";
import { openFileDialog, showMessage, showPrompt } from "@legendapp/spark/dialogs";
import { useMenu, type UseMenuOptions } from "@legendapp/spark/menus";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener, setToolbarItemText, type MacOSToolbarItem } from "@legendapp/spark/windows/macos";
import { createResultDraftStore, draftDirty, type ResultDraft } from "./resultDraft";
import { SettingsContext } from "./settings/panelOptions";
import { KeyBindingRouter } from "./KeyBindingRouter";
import { undoSheet } from "./gitUndo";
import { sectionOfRow, sidebarSections, type SidebarSectionId } from "./sidebarSections";

const contentInset = 52;

/** The main window, or (with `initialPath`) a window opened for one worktree, titled `<repoName> — <branch>`. */
export function App({ windowId = mainWindowId, initialPath, repoName }: GitWindowProps = {}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const sidebarMetrics = useRef<{ layout: string; requested: number; sizes: readonly [number, number] } | null>(null);
  const [changes, setChanges] = useState(emptyChanges);
  const changesRef = useRef(changes);
  changesRef.current = changes;
  const controller = useRef<ReturnType<typeof createGitChanges> | null>(null);
  // A conflicted file's unsaved Result edits; they survive refreshes and section switches, and actions that would drop them ask.
  const [resultDraft] = useState(createResultDraftStore);
  const [section, setSection] = useState<Section>("changes");
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState(emptyHistory);
  const historyController = useRef<ReturnType<typeof createGitHistory> | null>(null);
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
  const [stashPreview, setStashPreview] = useState(emptyStashPreview);
  const stashController = useRef<ReturnType<typeof createStashPreview> | null>(null);
  const [worktreePreview, setWorktreePreview] = useState(emptyWorktreePreview);
  const worktreeController = useRef<ReturnType<typeof createWorktreePreview> | null>(null);
  const [network, setNetwork] = useState(emptyNetwork);
  const networkController = useRef<ReturnType<typeof createGitNetwork> | null>(null);
  const [pulls, setPulls] = useState(emptyPullRequests);
  const pullsController = useRef<ReturnType<typeof createPullRequests> | null>(null);
  const pullsRef = useRef(pulls);
  pullsRef.current = pulls;
  const gitHub = useGitHubAccount();
  const signingIn = useRef(false);
  const [pullRange, setPullRange] = useState<{ start: DiffLineTarget; end: DiffLineTarget } | null>(null);
  // A line comment or reply, or (with `review`) a review of the whole pull request.
  const [commentSheet, setCommentSheet] = useState<{ title: string; context: string; review?: boolean; post: (body: string, event: ReviewEvent) => Promise<void> } | null>(null);
  // Create Pull Request…: the branch it is for, the base choices and the prefilled title; `creating` while publishing or posting.
  const [rebaseSheet, setRebaseSheet] = useState<{ plan: GitInteractiveRebasePlan; onto: string; owner: object; root: string | null } | null>(null);
  const [rebasing, setRebasing] = useState(false);
  const [createSheet, setCreateSheet] = useState<{ branch: string; bases: string[]; base: string; title: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const root = changes.root;
  const rootRef = useRef(root);
  rootRef.current = root;
  const recents = useRecentRepositories();
  // The window's settings (layout) and its remembered sizes; the repository layer follows the open repository.
  const layout = useWindowLayout(windowId, root);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // The pane Move Pane acts on: the one clicked last (state for the menu's label, the ref for the menu runner).
  const [focusedPanelId, setFocusedPanelId] = useState("diff");
  const focusedPanel = useRef(focusedPanelId);
  const layoutReady = layout.initialState !== undefined;
  // Sidebar sections the user expanded or collapsed in this window (see sidebarSections).
  const [expandedSections, setExpandedSections] = useState<Partial<Record<string, boolean>>>({});
  useEffect(() => {
    if (layout.initialState) { setSidebarCollapsed(layout.initialState.sidebarCollapsed ?? false); setExpandedSections(layout.initialState.sections ?? {}); }
  }, [layout.initialState]);
  const setSectionExpanded = (id: SidebarSectionId, expanded: boolean) => {
    setExpandedSections(current => ({ ...current, [id]: expanded }));
    layout.windowState?.setSectionExpanded(id, expanded);
  };
  const changeSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    layout.windowState?.setSidebarCollapsed(collapsed);
  };
  const operation = root ? changes.operation : null;
  // Git prepared a message (MERGE_MSG) that concludes the operation as one commit.
  const preparedMessage = operation?.kind === "merge" || operation?.kind === "cherry-pick" || operation?.kind === "revert";
  const queue = useMemo(() => root ? reviewQueue(refs) : [], [root, refs]);
  const selectedQueue = queueEntry(queue, section);
  const queueWorktree = selectedQueue?.kind === "worktree" ? selectedQueue : null;
  const queueBranch = selectedQueue?.kind === "branch" ? selectedQueue : null;
  const showsHistory = sectionShowsHistory(section);
  const selectedStash = sectionStash(section);
  const selectedWorktree = sectionWorktree(section);
  const selectedPullNumber = sectionPullRequest(section);
  // Rows are listed only while signed in (the list is cleared just after a sign-out).
  const selectedPull = root && selectedPullNumber !== null && gitHub.status === "signed-in" ? pulls.pulls?.find(pull => pull.number === selectedPullNumber) ?? null : null;
  // The comment sheet belongs to one file of one pull request; the review sheet to the pull request.
  useEffect(() => { setCommentSheet(null); }, [selectedPull?.number]);
  useEffect(() => { setCommentSheet(sheet => sheet?.review ? sheet : null); }, [pulls.selectedPath]);
  // The Create Pull Request sheet belongs to one repository and account.
  useEffect(() => { setCreateSheet(null); }, [changes.root, gitHub.status]);
  useEffect(() => { setRebaseSheet(null); }, [changes.root]);
  const selectedCommit = root && showsHistory ? history.selectedOid : null;
  const unstaged = unstagedEntries(changes.status);
  const staged = stagedEntries(changes.status);
  const selected = changes.selection;
  const busy = changes.writing || changes.loading;
  const applyLines = useRef<(() => void) | null>(null);
  const discardLines = useRef<(() => void) | null>(null);
  const commit = useRef<(() => void) | null>(null);
  const editedMergeMessage = useRef<(() => string | null) | null>(null);
  const generator = useRef<CommitMessageGenerator | null>(null);
  const [generating, setGenerating] = useState(false);
  const conflicts = conflictedEntries(changes.status).length;
  // A draft belongs to one repository and one conflict: it goes when either does (Abort, a resolve, another repository).
  const conflictedPaths = changes.status ? conflictedEntries(changes.status).map(entry => entry.path) : null;
  useEffect(() => { resultDraft.clear(); }, [root]); // eslint-disable-line react-hooks/exhaustive-deps -- resultDraft is stable
  useEffect(() => {
    const draft = resultDraft.get();
    if (draft && conflictedPaths && !conflictedPaths.includes(draft.path)) resultDraft.clear();
  }, [conflictedPaths?.join("\0")]); // eslint-disable-line react-hooks/exhaustive-deps -- the paths are the key
  const conflictList = root ? conflictedEntries(changes.status).map(entry => conflictSides(entry, changes.patch?.conflicted && changes.patch.path === entry.path ? changes.patch.conflict : undefined)) : [];
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
      const result = await openFileDialog({ windowId, selection: "directories", multiple: false, title: "Open Repository" });
      if (result.canceled || controller.current !== owner) return;
      // Asked only with unsaved edits, so a plain open takes no extra turn.
      if (unsavedResult(changesRef.current.selection?.path) && !await settleResult(changesRef.current.selection?.path, openingLoses)) return;
      await owner?.open(result.paths[0]!);
    } catch (error) { console.error(error); }
  }

  /** Opens a recent repository in this window; a folder that's gone or no longer a repository gets the Not a Repository sheet. */
  async function openRecent(path: string) {
    if (unsavedResult(changesRef.current.selection?.path) && !await settleResult(changesRef.current.selection?.path, openingLoses)) return;
    await controller.current?.open(path);
  }

  async function abortOperation() {
    const current = operation, owner = controller.current;
    if (!current || !owner) return;
    const { title, message } = abortWarning(current);
    const draft = unsavedResult(changesRef.current.selection?.path);
    const lost = draft ? ` Your unsaved edits to the Result of “${draft.path.split("/").pop()}” are lost too.` : "";
    if (await confirmDestructive(windowId, title, abortLabel(current.kind), message + lost, true)) await owner.abortOperation(current.kind);
  }

  async function discardFile() {
    const entry = selectedEntry;
    if (!canDiscardFile || !entry) return;
    const what = entry.kind === "untracked" ? `untracked file “${entry.path}”` : `changes to “${entry.path}”`;
    if (await confirmDestructive(windowId, `Discard ${what}?`, "Discard")) await controller.current?.discardFile(entry.path);
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
        await showMessage({ windowId, kind: "info", title: "Not Committed Yet", message: `Line ${target.line} of “${target.path}” has changes that are not committed yet.` });
        return;
      }
      showHistory();
      await owner.showFileHistory(target.path, hunk.oid);
    } catch (error) {
      if (error instanceof Error && error.name === "GitHistoryCancelledError") return;
      await showMessage({ windowId, kind: "warning", title: "Couldn’t Blame the Line", message: error instanceof Error ? error.message : String(error) }).catch(console.error);
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
    if (await confirmDestructive(windowId, `Restore ${files}?`, "Restore", message)) await controller.current?.restoreLastDiscard();
  }

  /** Shows HEAD's History now, so a file history started next isn't closed when History leaves a ref. */
  function showHistory() {
    historyController.current?.setRef(null);
    setSection("history");
  }

  /** Shows a branch write's failure (Git's own message) in a warning sheet. */
  const reportBranchError = (title: string, error: unknown) => showMessage({
    windowId, kind: "warning", title,
    message: (error instanceof Error ? error.message : String(error)).replace(/^(error|fatal): /gm, "").trim(),
  }).catch(console.error);

  /** Checks out the branch; when Git refuses because uncommitted changes would be overwritten, offers Stash and Switch. */
  async function checkout(ref: string) {
    const owner = refsController.current;
    // The controller's refs: a branch made just now isn't in this render's yet.
    const entry = findRef(owner?.current().refs ?? null, ref);
    if (!entry || entry.kind === "tag" || !owner) return false;
    // A selected remote branch gives way to the local branch made from it.
    const switched = (local: string) => { if (entry.kind === "remote") setSection(current => current === `ref:${ref}` ? `ref:${local}` : current); };
    try {
      switched(await owner.checkout(entry));
      return true;
    } catch (error) {
      if (!(error instanceof GitLocalChangesError)) { await reportBranchError(`Couldn’t Switch to “${entry.ref.name}”`, error); return false; }
      if (!await confirmStashAndSwitch(windowId, error.branch, error.message)) return false;
      try { switched(await owner.stashAndCheckout(entry)); return true; } catch (failed) { await reportBranchError(`Couldn’t Switch to “${entry.ref.name}”`, failed); return false; }
    }
  }

  /**
   * The local or remote branch a merge or rebase takes: `ref`, else one named in a prompt. Null when cancelled, gone, or
   * not something to merge (a tag, the current branch).
   */
  async function chooseBranch(owner: NonNullable<typeof refsController.current>, ref: string | undefined, title: string, message: string, moved: () => boolean) {
    let entry = ref ? findRef(owner.current().refs, ref) : null;
    if (ref && !entry) return null;
    if (!entry) {
      const result = await showPrompt({ windowId, title, message, placeholder: "Branch name", confirmLabel: "Continue" })
        .catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
      if (result.canceled || !result.value.trim() || moved()) return null;
      entry = resolveBranchName(owner.current().refs, result.value.trim());
      if (!entry) { await reportBranchError(`There’s No Branch Named “${result.value.trim()}”`, "Check the name, or pick a branch in the sidebar."); return null; }
    }
    return entry.kind === "tag" || (entry.kind === "branch" && entry.ref.current) ? null : entry;
  }

  /** Re-reads Changes and History after a branch operation, unless another repository opened meanwhile. */
  function afterOperation(moved: () => boolean) {
    if (!moved()) { void controller.current?.refresh(); void historyController.current?.refresh(); }
  }

  /**
   * Merges a local or remote branch into the current one (`git merge --no-edit`) after a sheet saying what happens; asks for
   * the branch's name when none is given. A branch merged already gets Git's "Already up to date."; a merge that stops with
   * conflicts shows Changes, with the operation bar above it.
   */
  async function mergeRef(ref?: string) {
    const owner = refsController.current, into = currentBranch, repository = rootRef.current;
    if (!owner || !into) return;
    // Another repository opened while a sheet was up.
    const moved = () => refsController.current !== owner || rootRef.current !== repository;
    const entry = await chooseBranch(owner, ref, `Merge into “${into}”`, `Enter the name of a local or remote branch to merge into “${into}”.`, moved);
    if (!entry) return;
    const name = entry.ref.name, title = `Couldn’t Merge “${name}” into “${into}”`;
    const upToDate = () => showMessage({ windowId, kind: "info", title: "Already up to date.", message: `“${into}” already has every commit of “${name}”.` }).catch(console.error);
    let kind: Awaited<ReturnType<typeof owner.mergeKind>>;
    try { kind = await owner.mergeKind(entry.ref.ref); } catch (error) { await reportBranchError(title, error); return; }
    if (kind === "up-to-date") { await upToDate(); return; }
    if (!await confirmMerge(windowId, name, into, kind) || moved()) return;
    try {
      const result = await owner.merge(entry.ref.ref, into);
      if (result === "up-to-date") await upToDate();
      else if (result === "stopped") setSection("changes");
    } catch (error) { await reportBranchError(title, error); }
    finally { afterOperation(moved); }
  }

  /**
   * Rebases the current branch onto a local or remote branch (`git rebase`) after a sheet naming both, the commits that move
   * and whether they were pushed; asks for the branch's name when none is given. A rebase that stops shows Changes under the
   * operation bar.
   */
  async function rebaseRef(ref?: string) {
    const owner = refsController.current, branch = currentBranch, repository = rootRef.current;
    if (!owner || !branch) return;
    const moved = () => refsController.current !== owner || rootRef.current !== repository;
    const entry = await chooseBranch(owner, ref, `Rebase “${branch}”`, `Enter the name of a local or remote branch to rebase “${branch}” onto.`, moved);
    if (!entry) return;
    const onto = entry.ref.name, title = `Couldn’t Rebase “${branch}” onto “${onto}”`;
    const upToDate = () => showMessage({ windowId, kind: "info", title: "Already up to date.", message: `“${branch}” already has every commit of “${onto}”.` }).catch(console.error);
    let plan: Awaited<ReturnType<typeof owner.rebasePlan>>;
    try { plan = await owner.rebasePlan(entry.ref.ref); } catch (error) { await reportBranchError(title, error); return; }
    if (!plan.behind) { await upToDate(); return; }
    if (!await confirmRebase(windowId, branch, onto, plan) || moved()) return;
    try {
      const result = await owner.rebase(entry.ref.ref, branch);
      if (result === "up-to-date") await upToDate();
      else if (result === "stopped") setSection("changes");
    } catch (error) { await reportBranchError(title, error); }
    finally { afterOperation(moved); }
  }

  /**
   * Opens the interactive rebase sheet for the current branch onto a branch (named in a prompt when none is given) or a
   * commit, after git-core's plan; a refused plan (changes, an operation in progress, merge commits, nothing to rebase) says why.
   */
  async function openInteractiveRebase(base: { ref?: string } | { oid: string }) {
    const owner = refsController.current, branch = currentBranch, repository = rootRef.current;
    if (!owner || !branch || rebaseSheet) return;
    const moved = () => refsController.current !== owner || rootRef.current !== repository;
    let target: string, onto: string;
    if ("oid" in base) {
      target = base.oid;
      const found = historyRef.current.commits.find(entry => entry.oid === base.oid);
      onto = found?.summary ? `${base.oid.slice(0, 7)} ${found.summary}` : base.oid.slice(0, 7);
    } else {
      const entry = await chooseBranch(owner, base.ref, `Rebase “${branch}” Interactively`, `Enter the name of a local or remote branch to rebase “${branch}” onto.`, moved);
      if (!entry) return;
      target = entry.ref.ref; onto = entry.ref.name;
    }
    const title = `Couldn’t Rebase “${branch}” Interactively`;
    let plan: GitInteractiveRebasePlan;
    try { plan = await owner.interactiveRebasePlan(target); } catch (error) { await reportBranchError(title, error); return; }
    if (moved()) return;
    if (plan.refusal) { await reportBranchError(title, plan.refusal); return; }
    setRebaseSheet({ plan, onto, owner, root: repository });
  }

  /**
   * Runs the sheet's todo. Rewriting pushed commits asks first, naming them; a rebase that stops shows Changes under the
   * operation bar; Git's refusal keeps the sheet open.
   */
  async function startInteractiveRebase(todo: GitTodoEntry[], updateRefs: boolean) {
    const sheet = rebaseSheet, owner = refsController.current;
    if (!sheet || !owner || owner !== sheet.owner || rebasing) return;
    const moved = () => refsController.current !== owner || rootRef.current !== sheet.root;
    const title = `Couldn’t Rebase “${sheet.plan.branch}” Interactively`;
    setRebasing(true);
    try {
      let allowPushed: string[] = [];
      for (;;) {
        try {
          const result = await owner.interactiveRebase(sheet.plan, todo, updateRefs, allowPushed);
          setRebaseSheet(null);
          if (result === "stopped") setSection("changes");
          else if (result === "unchanged") await showMessage({ windowId, kind: "info", title: "Nothing to Rebase", message: "Every commit is picked in its order, so nothing changed." }).catch(console.error);
          return;
        } catch (error) {
          if (!(error instanceof GitPushedCommitsError) || moved()) throw error;
          const choice = await showMessage({ windowId, kind: "warning", title: "Rewrite Pushed Commits?", message: `${error.message}

Rebase anyway?`,
            buttons: [{ id: "rebase", label: "Rebase Anyway" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "cancel", cancelButtonId: "cancel" }).catch(() => ({ buttonId: "cancel" }));
          if (choice.buttonId !== "rebase" || moved()) return;
          allowPushed = error.commits.map(entry => entry.oid);
        }
      }
    } catch (error) { await reportBranchError(title, error); }
    finally { setRebasing(false); afterOperation(moved); }
  }

  /**
   * Cherry-picks commit `oid` onto the current branch, or reverts it there after asking (`git cherry-pick`, `git revert
   * --no-edit`). Merge commits are refused; a pick the branch has already says so; one that stops shows Changes.
   */
  async function pickCommit(kind: "cherry-pick" | "revert", oid: string) {
    const owner = refsController.current, branch = currentBranch, repository = rootRef.current;
    if (!owner || !branch) return;
    const moved = () => refsController.current !== owner || rootRef.current !== repository;
    const found = historyRef.current.commits.find(entry => entry.oid === oid);
    const name = found?.summary ? `“${found.summary}”` : oid.slice(0, 7);
    const verb = kind === "revert" ? "Revert" : "Cherry-Pick";
    if (kind === "revert" && (!await confirmRevert(windowId, name, oid.slice(0, 7), branch) || moved())) return;
    try {
      const result = await owner.pick(kind, oid, branch);
      if (result === "stopped") setSection("changes");
      else if (result === "empty") await showMessage({ windowId, kind: "info", title: `Nothing to ${verb}`, message: `“${branch}” already has the changes of ${name}, so no commit was made.` }).catch(console.error);
    } catch (error) { await reportBranchError(`Couldn’t ${verb} ${name}`, error); }
    finally { afterOperation(moved); }
  }

  const openingLoses = "Your edits to its Result aren’t saved. Opening another repository without saving loses them.";
  const saveResult = (draft: ResultDraft) => controller.current?.saveConflictResult(draft.path, draft.text, draft.base) ?? Promise.resolve(false);
  /** Unsaved Result edits to `path`, or null. */
  const unsavedResult = (path: string | null | undefined) => { const draft = resultDraft.get(); return path && draft?.path === path && draftDirty(draft) ? draft : null; };

  /** Drops unsaved Result edits, showing the file as it was last read. */
  const dropResult = () => {
    const patch = changesRef.current.patch;
    resultDraft.revert(patch?.path === resultDraft.get()?.path ? patch?.regions?.text : undefined);
  };

  /**
   * Before leaving `path`'s unsaved Result edits (switching files or repositories, Mark Resolved): Save, Don't Save or Cancel.
   * Edits the file changed under can't be saved, so then it's Don't Save or Cancel.
   */
  async function settleResult(path: string | null | undefined, reason: string) {
    const draft = unsavedResult(path);
    if (!draft) return true;
    let choice: string | null;
    try {
      choice = (await showMessage({ windowId, kind: "warning", title: `Save your edits to “${draft.path.split("/").pop()}”?`,
        message: draft.stale ? `${reason} The file changed since you began editing, so they can’t be saved.` : reason,
        buttons: [...draft.stale ? [] : [{ id: "save", label: "Save" }], { id: "discard", label: "Don’t Save" }, { id: "cancel", label: "Cancel" }],
        defaultButtonId: draft.stale ? "cancel" : "save", cancelButtonId: "cancel" })).buttonId;
    } catch (error) { console.error(error); return false; }
    if (choice === "discard") { dropResult(); return true; }
    return choice === "save" && await resultDraft.save(saveResult);
  }

  /** Before a pick replaces `path`'s Result: asks to discard unsaved edits to it. */
  async function discardResultFor(path: string, label: string) {
    if (!unsavedResult(path)) return true;
    if (!await confirmDestructive(windowId, `Discard your edits to “${path.split("/").pop()}”?`, label,
      `${label} rewrites the file, so your unsaved edits to its Result are lost.`, true)) return false;
    dropResult();
    return true;
  }

  /** Selects a file in Changes once unsaved Result edits to the shown file are saved or dropped. */
  async function selectChange(selection: { section: "unstaged" | "staged"; path: string } | null) {
    const shown = changesRef.current.selection;
    if (shown && (shown.section !== selection?.section || shown.path !== selection.path)
      && !await settleResult(shown.path, "Your edits to its Result aren’t saved. Switching files without saving loses them.")) return;
    await controller.current?.select(selection);
  }

  /** Stages a conflicted file to mark it resolved; one that still has conflict markers asks first. */
  async function markResolved(path: string) {
    if (!await settleResult(path, "Mark Resolved stages the file as it is on disk, without your unsaved edits to its Result.")) return;
    const owner = controller.current, repository = rootRef.current;
    if (!owner) return;
    let markers: boolean;
    try { markers = await owner.hasConflictMarkers(path); } catch (error) { await reportBranchError("Couldn’t Mark the File Resolved", error); return; }
    if (markers && !await confirmDestructive(windowId, `Mark “${path.split("/").pop()}” as resolved anyway?`, "Mark Resolved",
      "It still has conflict markers (lines starting with <<<<<<< or >>>>>>>). Marked resolved, they are staged and committed as they are.", true)) return;
    if (controller.current === owner && rootRef.current === repository) await owner.changeFile(path, true);
  }

  /**
   * Resolves a conflicted file with one side or both and stages it. A file with no conflict markers left that matches neither
   * side was resolved by hand, so replacing it asks first.
   */
  async function pickConflict(path: string, side: GitConflictSide) {
    const owner = controller.current, repository = rootRef.current;
    if (!owner) return;
    const label = commandLabel(`use-${side}`, contextRef.current, path), name = path.split("/").pop();
    if (!await discardResultFor(path, label)) return;
    let file: GitConflictFile | null;
    try { file = await owner.conflictFile(path); } catch (error) { await reportBranchError("Couldn’t Resolve the Conflict", error); return; }
    if (!file) { void owner.refresh(); return; }
    if (file.edited && !await confirmDestructive(windowId, `Replace your edits to “${name}”?`, label,
      `“${name}” has no conflict markers left and matches neither version, so it looks resolved by hand. ${label} replaces your edits.`, true)) return;
    if (controller.current === owner && rootRef.current === repository) await owner.resolveConflict(path, side);
  }

  /**
   * Fetches a pull request's head into a local branch named after it (see pullRequestBranch), then checks the branch
   * out (offering Stash and Switch when changes are in the way) or adds a worktree for it next to the repository and
   * opens it in its own window. A worktree that has the branch already is just opened.
   */
  async function checkOutPullRequest(number: number, worktree: boolean) {
    const pull = pullsRef.current.pulls?.find(entry => entry.number === number), remote = pullsRef.current.remote;
    const network = networkController.current, owner = refsController.current;
    if (!pull || !remote || !network || !owner) return;
    const branch = pullRequestBranch(pull);
    const open = (path: string) => {
      const name = repositoryName();
      openWorktreeWindow(path, name, `${name} — ${branch}`).catch((error: unknown) => reportBranchError("Couldn’t Open the Worktree", error));
    };
    const existing = worktree ? refsRef.current.worktrees?.find(entry => entry.branch === branch && entry.prunable === null) : undefined;
    if (existing) { setSection(`worktree:${existing.path}`); if (existing.path !== root) open(existing.path); return; }
    try {
      await network.fetchPullRequest(remote, number, branch);
    } catch (error) {
      if (!(error instanceof GitServiceError && error.code === "aborted")) await reportBranchError(`Couldn’t Fetch Pull Request #${number}`, (error instanceof Error ? error.message : String(error)).replace(/^hint:.*(?:\n|$)/gm, "").trim());
      return;
    }
    if (refsController.current !== owner) return;
    await owner.refresh();
    if (!worktree) {
      if (await checkout(`refs/heads/${branch}`)) setSection(`ref:refs/heads/${branch}`);
      return;
    }
    const main = owner.current().worktrees?.[0]?.path ?? root;
    if (!main) return;
    try {
      const path = await owner.addWorktreeNextTo(main, branch);
      setSection(`worktree:${path}`);
      open(path);
    } catch (error) { await reportBranchError("Couldn’t Create the Worktree", error); }
  }

  async function stashChanges(includeUntracked: boolean) {
    const owner = refsController.current;
    if (!owner) return;
    const untracked = changes.status?.entries.filter(entry => entry.kind === "untracked").length ?? 0;
    const message = includeUntracked ? "Your changes and untracked files are saved as a stash and removed from the working tree."
      : `Your changes are saved as a stash and removed from the working tree.${untracked ? " Untracked files stay; use Stash Changes Including Untracked… to stash them too." : ""}`;
    const result = await showPrompt({ windowId, title: "Stash Changes", message, placeholder: "Message (optional)", confirmLabel: "Stash" })
      .catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    if (result.canceled) return;
    try { await owner.stash(result.value.trim(), includeUntracked); } catch (error) { await reportBranchError("Couldn’t Stash the Changes", error); }
  }

  /** Apply, Pop or Drop (after a warning sheet) one stash; Git's message is shown when it refuses or conflicts. */
  async function stashWrite(oid: string, action: "apply" | "pop" | "drop") {
    const owner = refsController.current, entry = refsRef.current.stashes?.find(stash => stash.oid === oid);
    if (!owner || !entry) return;
    if (action === "drop" && !await confirmDestructive(windowId, `Drop the stash “${stashLabel(entry.message)}”?`, "Drop", "Its changes are deleted from the stash list.", true)) return;
    try {
      if (action === "apply") await owner.applyStash(oid);
      else if (action === "pop") await owner.popStash(oid);
      else await owner.dropStash(oid);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const title = { apply: "Couldn’t Apply the Stash", pop: "Couldn’t Pop the Stash", drop: "Couldn’t Drop the Stash" }[action];
      await reportBranchError(title, action === "drop" || error instanceof GitStashDropError ? text : `${text}\n\nThe stash was kept.`);
    }
  }

  /** The repository's name: its main worktree's folder. */
  const repositoryName = () => worktreeName(refsRef.current.worktrees?.[0]?.path ?? root ?? "");

  function openWorktree(path: string) {
    const entry = refsRef.current.worktrees?.find(worktree => worktree.path === path);
    if (!entry) return;
    const name = repositoryName();
    openWorktreeWindow(path, name, `${name} — ${entry.branch ?? entry.head?.slice(0, 7) ?? worktreeName(path)}`)
      .catch((error: unknown) => reportBranchError("Couldn’t Open the Worktree", error));
  }

  /**
   * Asks for a branch (an existing local branch is checked out, any other name becomes a new branch from HEAD), then for
   * the folder to put the worktree in; the worktree goes in a new subfolder named after the branch.
   */
  async function newWorktree() {
    const owner = refsController.current;
    if (!owner) return;
    const result = await showPrompt({
      windowId, title: "New Worktree", confirmLabel: "Continue", placeholder: "Branch name",
      message: `Enter an existing branch to check out in the new worktree, or a new branch name to create from ${currentBranch ? `“${currentBranch}”` : "the current commit"}. Next, choose where to put it.`,
    }).catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    const name = result.canceled ? "" : result.value.trim();
    if (!name) return;
    const existing = refsRef.current.refs?.branches.some(branch => branch.name === name);
    const parent = await openFileDialog({ windowId, selection: "directories", multiple: false, title: "Choose the Folder for the New Worktree" })
      .catch((error: unknown) => { console.error(error); return { canceled: true as const, paths: [] }; });
    if (parent.canceled || !parent.paths[0]) return;
    const path = `${parent.paths[0].replace(/\/+$/, "")}/${name.replace(/\//g, "-")}`;
    try {
      setSection(`worktree:${await owner.addWorktree(path, existing ? { branch: name } : { newBranch: name })}`);
    } catch (error) { await reportBranchError("Couldn’t Create the Worktree", error); }
  }

  /** Asks first; when Git refuses (changes or a lock), shows its message and asks again before forcing. */
  async function removeWorktree(path: string) {
    const owner = refsController.current, entry = refsRef.current.worktrees?.find(worktree => worktree.path === path);
    if (!owner || !entry) return;
    const name = worktreeName(path);
    if (openWorktreePaths.has(path)) {
      await reportBranchError(`“${name}” Is Open in Another Window`, "Close its window, then remove the worktree.");
      return;
    }
    const missing = entry.prunable !== null;
    if (!await confirmDestructive(windowId, `Remove the worktree “${name}”?`, "Remove", missing ? "Its folder is gone already; Git forgets it." : `Its folder ${path} is deleted. Its branch${entry.branch ? ` “${entry.branch}”` : ""} stays.`, true)) return;
    try {
      await owner.removeWorktree(path);
    } catch (error) {
      // Only Git's refusals over changes or a lock can be overridden; anything else is just reported.
      if (!(error instanceof Error) || !/use --force|remove -f -f/.test(error.message)) { await reportBranchError(`Couldn’t Remove “${name}”`, error); return; }
      const reason = error.message.replace(/^(error|fatal): /gm, "").trim();
      if (!await confirmDestructive(windowId, `Git didn’t remove “${name}”.`, "Remove Anyway", `${reason}\n\nRemoving it anyway deletes its uncommitted changes and untracked files.`, true)) return;
      try { await owner.removeWorktree(path, true); } catch (forced) { await reportBranchError(`Couldn’t Remove “${name}”`, forced); }
    }
  }

  function revealInFinder(path: string) {
    runProcess({ target: { type: "command", name: "open" }, args: ["-R", "--", path], timeoutMs: 10_000 })
      .then(result => { if (result.exit.type !== "exited" || result.exit.code !== 0) console.error("open -R failed", result.exit); }, console.error);
  }

  async function switchBranch() {
    const selectedRef = findRef(refsRef.current.refs, sectionRef(section));
    const result = await showPrompt({
      windowId, title: "Switch Branch", message: "Enter the name of a local branch, or of a remote branch to check out as a new tracking branch.",
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
    const result = await showPrompt({ windowId, title: "New Branch", message: `The new branch starts at ${from} and is checked out.`, placeholder: "Branch name", confirmLabel: "Create" })
      .catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    const name = result.canceled ? "" : result.value.trim();
    if (!name) return;
    try { await owner.create(name, start); } catch (error) { await reportBranchError("Couldn’t Create the Branch", error); }
  }

  async function renameBranch(ref: string) {
    const entry = findRef(refsRef.current.refs, ref), owner = refsController.current;
    if (entry?.kind !== "branch" || !owner) return;
    const result = await showPrompt({ windowId, title: `Rename “${entry.ref.name}”`, message: "Enter a new name for the branch.", defaultValue: entry.ref.name, confirmLabel: "Rename" })
      .catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    const name = result.canceled ? "" : result.value.trim();
    if (!name || name === entry.ref.name) return;
    try {
      await owner.rename(entry.ref.name, name);
      setSection(current => current === `ref:${ref}` ? `ref:refs/heads/${name}` : current);
    } catch (error) { await reportBranchError(`Couldn’t Rename “${entry.ref.name}”`, error); }
  }

  /**
   * Edit ▸ Undo: a refused undo says why; otherwise a sheet names what moves where before the reflog's newest operation is
   * taken back. Git's refusal (the repository changed meanwhile) shows as a warning.
   */
  async function undoOperation() {
    const owner = refsController.current, plan = refsRef.current.undo, repository = rootRef.current;
    if (!owner || !plan) return;
    const moved = () => refsController.current !== owner || rootRef.current !== repository;
    const sheet = undoSheet(plan);
    if (plan.refusal) { await reportBranchError(`Couldn’t ${sheet.button}`, plan.refusal); return; }
    if (!await confirmDestructive(windowId, sheet.title, sheet.button, sheet.message) || moved()) return;
    try { await owner.undo(plan); } catch (error) { await reportBranchError(`Couldn’t ${sheet.button}`, error); }
    finally { afterOperation(moved); }
  }

  /** Asks first; when Git refuses because the branch is not fully merged, asks again before `git branch -D`. */
  async function deleteBranch(ref: string) {
    const entry = findRef(refsRef.current.refs, ref), owner = refsController.current;
    if (entry?.kind !== "branch" || !owner) return;
    const name = entry.ref.name;
    // A branch whose pull request was merged (squashed or rebased, so Git calls it unmerged) is deleted after one question.
    const mark = pullsRef.current.merged[name];
    const merged = mark?.oid === entry.ref.oid ? mark.number : null;
    if (!await confirmDestructive(windowId, `Delete the branch “${name}”?`, "Delete", merged !== null
      ? `Its pull request #${merged} was merged on GitHub.` : "Its commits stay in the repository only while another branch or tag contains them.")) return;
    try {
      // Forced only while the branch is still at the merged tip; a commit made meanwhile gets Git's check again.
      if (merged !== null) await owner.refresh();
      const still = merged !== null && findRef(owner.current().refs, ref)?.ref.oid === mark!.oid;
      await owner.delete(name, still);
    } catch (error) {
      if (!(error instanceof GitBranchNotMergedError)) { await reportBranchError(`Couldn’t Delete “${name}”`, error); return; }
      const upstream = entry.ref.upstream;
      if (!await confirmDestructive(windowId, `“${name}” isn’t fully merged.`, "Delete Anyway", `It has commits that aren’t on ${upstream ? `its upstream “${upstream}”` : "the current branch"}. Deleting it may lose them.`, true)) return;
      try { await owner.delete(name, true); } catch (forced) { await reportBranchError(`Couldn’t Delete “${name}”`, forced); }
    }
  }

  /** Runs a fetch, pull or push; Git's message goes in a warning sheet, a cancelled one says nothing. Changes and History re-read after. */
  async function runNetwork(operation: NetworkOperation, start: (owner: ReturnType<typeof createGitNetwork>) => Promise<void>, upstream?: string | null) {
    const owner = networkController.current;
    if (!owner) return false;
    const branch = changes.status?.branch;
    try {
      await start(owner);
      return true;
    } catch (error) {
      if (error instanceof GitServiceError && error.code === "aborted") return false;
      const text = (error instanceof Error ? error.message : String(error)).replace(/^hint:.*(?:\n|$)/gm, "").trim();
      if (error instanceof GitPushRejectedError) await reportBranchError(`“${(upstream === undefined ? branch?.upstream : upstream) ?? "The remote"}” Has Commits You Don’t Have`, `Pull first, then push again.\n\n${text}`);
      else if (error instanceof GitPullDivergedError) {
        await reportBranchError("Couldn’t Pull", `${text}\n\n“${branch?.head}” and “${branch?.upstream}” both have new commits. Legend Git pulls only by fast-forward for now; merge or rebase the branch in Terminal.`);
      } else await reportBranchError({ fetch: "Couldn’t Fetch", pull: "Couldn’t Pull", push: "Couldn’t Push", publish: "Couldn’t Publish the Branch" }[operation], text);
      return false;
    } finally {
      if (networkController.current === owner) { void controller.current?.refresh(); void historyController.current?.refresh(); }
    }
  }

  /** Pushes a queue entry's branch, or publishes it (after the sheet) when it has no upstream; the queue re-reads after. */
  async function pushQueueEntry(id: QueueEntry["id"]) {
    const owner = networkController.current, entry = reviewQueue(refsRef.current).find(item => item.id === id);
    const target = entry && queuePushTarget(entry);
    if (!owner || !entry || !target) return;
    try {
      if (!target.publish) { await runNetwork("push", current => current.pushBranch(target.branch), entry.upstream); return; }
      const remote = await owner.publishRemote().catch((error: unknown) => { console.error(error); return null; });
      if (!remote) { await reportBranchError("There’s No Remote to Publish To", "Add a remote to the repository (git remote add), then publish the branch."); return; }
      if (networkController.current !== owner || !await confirmPublish(windowId, target.branch, remote)) return;
      await runNetwork("publish", current => current.publishBranch(target.branch, remote));
    } finally { void refsController.current?.refresh(); }
  }

  /** Stages or unstages one file of the selected queued worktree, in that worktree. */
  async function changeQueueFile(path: string, stage: boolean) {
    try { await worktreeController.current?.write(stage ? { stage: path } : { unstage: path }); }
    catch (error) { await reportBranchError(stage ? "Couldn’t Stage the File" : "Couldn’t Unstage the File", error); }
  }

  /** Asks for a commit message in a sheet, then commits the queued worktree's index there. */
  async function commitQueueWorktree() {
    const entry = queueWorktree, owner = worktreeController.current;
    if (!entry || !owner) return;
    const result = await showPrompt({
      windowId, title: `Commit to “${entry.branch ?? entry.name}”`, message: `Commits the staged changes in the worktree “${entry.name}”.`, placeholder: "Summary", confirmLabel: "Commit",
    }).catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
    const message = result.canceled ? "" : result.value.trim();
    if (!message) return;
    try { await owner.write({ commit: `${message}\n` }); } catch (error) { await reportBranchError("Couldn’t Commit", error); }
    finally { void refsController.current?.refresh(); }
  }

  /** Pushes; a branch without an upstream is published to the default remote after a sheet naming it. */
  async function push() {
    const owner = networkController.current, branch = changes.status?.branch;
    if (!owner || !branch?.head) return;
    if (branch.upstream) { await runNetwork("push", current => current.push()); return; }
    const remote = await owner.publishRemote().catch((error: unknown) => { console.error(error); return null; });
    if (!remote) { await reportBranchError("There’s No Remote to Publish To", "Add a remote to the repository (git remote add), then publish the branch."); return; }
    if (networkController.current !== owner || !await confirmPublish(windowId, branch.head, remote)) return;
    await runNetwork("publish", current => current.publish(remote));
  }

  /**
   * Sign In to GitHub: GitHub CLI's token when `gh` is signed in (after a sheet that also offers pasting one), else a
   * pasted token in a secure field. The token is checked with GET /user before it goes in the keychain; it's never shown.
   */
  async function signInToGitHub() {
    if (signingIn.current) return;
    signingIn.current = true;
    try { await signIn(); } finally { signingIn.current = false; }
  }
  async function signIn() {
    const cliToken = await gitHubCliToken();
    let token = cliToken;
    if (cliToken) {
      const choice = await showMessage({
        windowId, kind: "info", title: "Sign In to GitHub",
        message: "Legend Git reads pull requests with a GitHub token kept in your keychain. Use the account GitHub CLI (gh) is signed in with, or paste a fine-grained personal access token.",
        buttons: [{ id: "cli", label: "Use GitHub CLI" }, { id: "paste", label: "Paste Token…" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "cli", cancelButtonId: "cancel",
      }).catch((error: unknown) => { console.error(error); return { buttonId: "cancel" }; });
      if (choice.buttonId === "cancel") return;
      if (choice.buttonId === "paste") token = null;
    }
    if (!token) {
      const result = await showPrompt({
        windowId, title: "Sign In to GitHub", secure: true, placeholder: "github_pat_…", confirmLabel: "Sign In",
        message: "Paste a fine-grained personal access token with read access to the repository’s pull requests and contents. Legend Git keeps it in your keychain.",
      }).catch((error: unknown) => { console.error(error); return { canceled: true as const }; });
      if (result.canceled || !result.value.trim()) return;
      token = result.value.trim();
    }
    try { await gitHubAccount.signIn(token, pullsController.current?.apiUrl()); }
    catch (error) { await reportBranchError("Couldn’t Sign In to GitHub", error); }
  }

  /** GitHub's message for a refused write; a 401 offers Sign In… (closing the sheet the write came from). */
  async function reportGitHubError(title: string, error: unknown, closeSheet: () => void) {
    if (!(error instanceof GitHubError && error.kind === "unauthorized")) { await reportBranchError(title, error); return; }
    const choice = await showMessage({ windowId, kind: "warning", title, message: error.message,
      buttons: [{ id: "sign-in", label: "Sign In…" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "sign-in", cancelButtonId: "cancel" }).catch((failed: unknown) => { console.error(failed); return { buttonId: "cancel" }; });
    if (choice.buttonId === "sign-in") { closeSheet(); runCommand("sign-in-github", contextRef.current); }
  }

  /** Posts from the comment sheet; on failure the sheet stays open with the text, GitHub's message shows, and a 401 offers Sign In…. */
  async function postComment(sheet: NonNullable<typeof commentSheet>, body: string, event: ReviewEvent) {
    try { await sheet.post(body, event); setCommentSheet(null); }
    catch (error) { await reportGitHubError(sheet.review ? "Couldn’t Submit the Review" : "Couldn’t Post the Comment", error, () => setCommentSheet(null)); }
  }

  /** Create Pull Request…: the sheet for the current branch, its base preselected and its title from its only commit. */
  async function openCreatePullRequest() {
    const owner = pullsController.current, branch = refsController.current?.current().refs?.branches.find(entry => entry.current);
    if (!owner || !branch || createSheet) return;
    const { bases, base } = pullRequestBases(refsRef.current.refs, pullsRef.current.remote);
    const title = await owner.suggestedTitle(branch.name, base);
    if (pullsController.current === owner) setCreateSheet({ branch: branch.name, bases, base, title });
  }

  /**
   * Publishes the branch (after the sheet naming the remote) when it has no upstream, or pushes commits it hasn't pushed,
   * then opens the pull request and selects it. On failure the sheet keeps what was typed.
   */
  async function submitCreatePullRequest(input: PullRequestInput) {
    const sheet = createSheet, refsOwner = refsController.current, network = networkController.current, owner = pullsController.current, start = root;
    const branch = sheet && refsOwner?.current().refs?.branches.find(entry => entry.name === sheet.branch);
    if (!sheet || !refsOwner || !network || !owner || !branch || !start || creating) return;
    setCreating(true);
    try {
      let target = pushedAs(refsOwner.current().refs!, branch);
      if (!target) {
        const remote = await network.publishRemote().catch((error: unknown) => { console.error(error); return null; });
        if (!remote) { await reportBranchError("There’s No Remote to Publish To", "Add a remote to the repository (git remote add), then publish the branch."); return; }
        if (!await confirmPublish(windowId, branch.name, remote) || !await runNetwork("publish", current => current.publishBranch(branch.name, remote))) return;
        target = { remote, branch: branch.name };
      } else if (branch.ahead > 0 && !await runNetwork("push", current => current.pushBranch(branch.name), branch.upstream)) return;
      void refsOwner.refresh();
      // Another repository opened meanwhile (its sheet closed with it).
      if (rootRef.current !== start) return;
      try {
        const number = await owner.createPullRequest({ ...input, root: start, remote: target.remote, remoteBranch: target.branch });
        if (rootRef.current !== start) return;
        setCreateSheet(null);
        if (number !== null) setSection(`pr:${number}`);
      } catch (error) { await reportGitHubError("Couldn’t Create the Pull Request", error, () => setCreateSheet(null)); }
    } finally { setCreating(false); }
  }
  const githubSide = (target: DiffLineTarget) => target.side === "old" ? "LEFT" as const : "RIGHT" as const;
  function addPullComment() {
    const range = pullRange, path = pulls.selectedPath;
    if (!range || !path || pulls.writing) return;
    const old = (target: DiffLineTarget) => `${target.line}${target.side === "old" ? " (old)" : ""}`;
    const lines = range.start.side === range.end.side && range.start.line === range.end.line ? `Line ${old(range.end)}` : `Lines ${old(range.start)}–${old(range.end)}`;
    const location = commentRange({ side: githubSide(range.start), line: range.start.line }, { side: githubSide(range.end), line: range.end.line });
    setCommentSheet({ title: "Add Comment", context: `${lines} of “${path}”`, post: body => pullsController.current?.addComment({ ...location, body }) ?? Promise.resolve() });
  }
  function reviewPullRequest() {
    const pull = selectedPull;
    if (!pull || pulls.writing) return;
    setCommentSheet({ title: "Review Pull Request", context: `#${pull.number} ${pull.title}`, review: true, post: (body, event) => pullsController.current?.submitReview(event, body) ?? Promise.resolve() });
  }
  function replyToThread(thread: ReviewThread) {
    const first = thread.comments[0];
    if (!first || pulls.writing) return;
    setCommentSheet({ title: `Reply to ${first.author}`, context: `${threadLines(thread)} of “${thread.path}”`, post: body => pullsController.current?.reply(first.databaseId, body) ?? Promise.resolve() });
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
    canApplyLines: !!root && section === "changes" && !!changes.patch?.file?.hunks.length,
    linesLabel: `${selected?.section === "staged" ? "Unstage" : "Stage"} Selected Lines`,
    canDiscardFile: section === "changes" && canDiscardFile,
    canDiscardLines: section === "changes" && !busy && changes.patch?.section === "unstaged" && !!changes.patch.file?.hunks.length,
    canRestoreDiscard: !busy && !!lastDiscard,
    generating,
    canGenerate: !!root && section === "changes" && !busy && !!staged.length && !conflicts,
    canCommit: !!root && section === "changes" && !busy
      || !!queueWorktree && worktreePreview.path === queueWorktree.path && !worktreePreview.writing && worktreePreview.files.some(file => file.kind !== "untracked" && file.indexStatus !== "."),
    refs: root ? refs.refs : null,
    unborn: !root || changes.status?.branch.oid === "(initial)",
    branchBusy: refs.writing,
    undo: root ? refs.undo : null,
    stashes: root ? refs.stashes : null,
    hasChanges: !!changes.status?.entries.length,
    worktrees: root ? refs.worktrees : null,
    root,
    currentBranch: root ? currentBranch : null,
    upstream: root ? changes.status?.branch.upstream ?? null : null,
    hasRemote: !!root && !!refs.refs?.remotes.length,
    network: root ? network.operation : null,
    queue,
    recents,
    operation,
    conflicts: conflictList,
    gitHub,
    pullRequests: root && gitHub.status === "signed-in" && pulls.remote ? pulls.pulls?.map(pull => pull.number) ?? [] : [],
    pullWriting: pulls.writing,
    pullRequestUrl: selectedPull?.url || null,
    canCreatePullRequest: !!root && gitHub.status === "signed-in" && !!pulls.repo && !!pulls.remote && !!currentBranch && !createSheet,
    unstagedPaths: root ? unstaged.map(entry => entry.path) : [],
    stagedPaths: root ? staged.map(entry => entry.path) : [],
    selectedChange: root ? selected : null,
    run: {
      openRepository: () => void chooseRepository(),
      openRecent,
      abortOperation: () => void abortOperation(),
      // A merge message edited in the composer is the merge commit's message; otherwise Git's prepared one is used.
      continueOperation: () => {
        if (!canContinue(operation)) return;
        const message = preparedMessage ? editedMergeMessage.current?.() : null;
        void (message ? controller.current?.commit({ message }) : controller.current?.continueOperation(operation.kind));
      },
      toggleSidebar: () => changeSidebarCollapsed(!sidebarCollapsed),
      showSection: setSection,
      refresh: () => { void controller.current?.refresh(); void historyController.current?.refresh(); void pullsController.current?.refresh(); },
      copySha: oid => { setStringAsync(oid).catch(console.error); },
      openOnGitHub: oid => {
        const url = commitGitHubUrl(historyRef.current, oid);
        if (url) openURL(url).catch(console.error);
      },
      openPullRequestOnGitHub: url => { openURL(url).catch(console.error); },
      createPullRequest: () => void openCreatePullRequest(),
      showFileHistory: path => { showHistory(); void historyController.current?.showFileHistory(path); },
      closeFileHistory: () => {
        historyController.current?.closeFileHistory();
        if (historyQuery) { setHistoryQuery(""); setSearchEpoch(value => value + 1); }
      },
      blameLine: () => void blameLine(),
      compareWith: oid => void historyController.current?.compare(oid),
      applyLines: () => applyLines.current?.(),
      discardFile: () => void discardFile(),
      discardLines: () => discardLines.current?.(),
      restoreDiscard: () => void restoreDiscard(),
      toggleGenerate: () => generator.current?.toggle(),
      commit: () => { if (queueWorktree) void commitQueueWorktree(); else commit.current?.(); },
      checkout: ref => void checkout(ref),
      mergeRef: ref => void mergeRef(ref),
      rebaseRef: ref => void rebaseRef(ref),
      interactiveRebase: base => void openInteractiveRebase(base),
      pickCommit: (kind, oid) => void pickCommit(kind, oid),
      markResolved: path => void markResolved(path),
      pickConflict: (path, side) => void pickConflict(path, side),
      switchBranch: () => void switchBranch(),
      newBranch: start => void newBranch(start),
      renameBranch: ref => void renameBranch(ref),
      deleteBranch: ref => void deleteBranch(ref),
      undo: () => void undoOperation(),
      copyText: text => { setStringAsync(text).catch(console.error); },
      stashChanges: includeUntracked => void stashChanges(includeUntracked),
      applyStash: oid => void stashWrite(oid, "apply"),
      popStash: oid => void stashWrite(oid, "pop"),
      dropStash: oid => void stashWrite(oid, "drop"),
      openWorktree,
      newWorktree: () => void newWorktree(),
      removeWorktree: path => void removeWorktree(path),
      revealInFinder,
      fetch: () => void runNetwork("fetch", owner => owner.fetch()),
      pull: () => void runNetwork("pull", owner => owner.pull()),
      push: () => void push(),
      cancelNetwork: () => networkController.current?.cancel(),
      pushQueueEntry: id => void pushQueueEntry(id),
      signInToGitHub: () => void signInToGitHub(),
      reviewPullRequest,
      checkOutPullRequest: (number, worktree) => void checkOutPullRequest(number, worktree),
      changeFile: (path, stage) => { if (stage && conflictList.some(entry => entry.path === path)) void markResolved(path); else void controller.current?.changeFile(path, stage); },
      changeAll: stage => void controller.current?.changeFiles(stage ? unstaged.filter(entry => entry.kind !== "unmerged").map(entry => entry.path) : staged.map(entry => entry.path), stage),
      signOutOfGitHub: () => { gitHubAccount.signOut().catch((error: unknown) => reportBranchError("Couldn’t Sign Out of GitHub", error)); },
    },
  };
  const contextRef = useRef(context);
  contextRef.current = context;
  // Settings key bindings over the defaults; the menu bar carries each command's first one.
  const keyBindings = useMemo(() => resolveKeyBindings(layout.settings.keybindings), [layout.settings.keybindings]);
  const item = (id: CommandId) => commandMenuItem(id, context, { keys: keyBindings.keys });

  const menu: UseMenuOptions = {
    id: "legend-git",
    items: [
      { type: "submenu", id: "app", label: "Legend Git", target: { menu: "app" }, items: [{ type: "action", id: "settings", label: "Settings…", target: { role: "settings" } }] },
      { type: "submenu", id: "file", label: "File", target: { menu: "file" }, items: [
        // AppKit's own Open Recent (filled from the system's recent documents) sits between these two.
        item("open-repository"), item("open-worktree"), { type: "separator" }, item("reveal-repository"),
      ] },
      { type: "submenu", id: "edit", label: "Edit", target: { menu: "edit" }, items: [item("undo-operation"), { type: "separator" }, item("copy-sha"), { type: "separator" }, item("blame-line")] },
      // AppKit's own View ▸ Show/Hide Sidebar drives the split view, so the menu has no second one.
      { type: "submenu", id: "view", label: "View", target: { menu: "view" }, items: [item("show-changes"), item("show-history"), item("show-review"), { type: "separator" }, item("show-file-history"), item("show-all-history"), { type: "separator" },
        layoutMenu(layout, viewKindFor(section), focusedPanelId), diffMenu(layout.settings.panels.diff, !!layout.store && !layout.store.isReadOnly("user")), { type: "separator" },
        { type: "action", id: "customize-toolbar", label: "Customize Toolbar…" }] },
      { type: "submenu", id: "repository", label: "Repository", placement: { before: { menu: "window" } }, items: [item("fetch"), item("pull"), item("push"), item("cancel-network"), { type: "separator" }, item("refresh"), { type: "separator" }, item("create-pull-request"), item("open-github"), { type: "separator" }, item("sign-in-github"), item("sign-out-github")] },
      { type: "submenu", id: "pull-request", label: "Pull Request", placement: { before: { menu: "window" } }, items: [item("review-pull-request"), { type: "separator" }, item("checkout-pull-request"), item("pull-request-worktree")] },
      { type: "submenu", id: "branch", label: "Branch", placement: { before: { menu: "window" } }, items: [item("switch-branch"), item("new-branch"), { type: "separator" }, item("rename-branch"), item("delete-branch"), { type: "separator" }, item("merge-ref"), item("rebase-ref"), item("interactive-rebase-ref"), item("cherry-pick-commit"), item("revert-commit"), { type: "separator" }, item("abort-operation"), item("continue-operation")] },
      { type: "submenu", id: "worktree", label: "Worktree", placement: { before: { menu: "window" } }, items: [item("new-worktree"), item("open-review-worktree"), { type: "separator" }, item("reveal-worktree"), item("remove-worktree")] },
      {
        type: "submenu", id: "changes", label: "Changes", placement: { before: { menu: "window" } },
        items: [
          item("stage-file"), item("unstage-file"), item("stage-all"), item("unstage-all"), { type: "separator" },
          item("apply-lines"), { type: "separator" },
          item("use-ours"), item("use-theirs"), item("use-both"), item("mark-resolved"), { type: "separator" },
          item("discard-file"), item("discard-lines"), item("restore-discard"), { type: "separator" },
          item("stash-changes"), item("stash-all-changes"), item("apply-stash"), item("pop-stash"), item("drop-stash"), { type: "separator" },
          item("generate-message"), item("commit"),
        ],
      },
    ],
    onAction: action => runMenuAction(action.itemId),
  };
  // The menu bar's commands are fixed; bindings it can't carry go to the window's hotkey router.
  const routedKeys = useMemo(() => routedBindings(keyBindings, menuCommandIds(menu.items)), [keyBindings]); // eslint-disable-line react-hooks/exhaustive-deps -- see above
  useEffect(() => { if (windowId !== mainWindowId) publishMenu(windowId, menu); });

  // A search ended by something other than the field (a file's history, a blame) clears the field too.
  useEffect(() => {
    if (!history.search && historyQuery) { setHistoryQuery(""); setSearchEpoch(value => value + 1); }
  }, [history.search]); // eslint-disable-line react-hooks/exhaustive-deps -- only when the search ends
  useEffect(() => {
    historyController.current?.setRoot(root);
    refsController.current?.setRoot(root);
    stashController.current?.setRoot(root);
    worktreeController.current?.setRoot(root);
    networkController.current?.setRoot(root);
    void pullsController.current?.setRoot(root);
    if (!root) setSection("changes");
    // Worktree windows open from the main one, so only repositories opened by the user become recents.
    if (root && !initialPath) void recentRepositories.note(root);
  }, [root]); // eslint-disable-line react-hooks/exhaustive-deps -- initialPath is fixed per window
  // Not a Repository (§5): a sheet offering another folder; the repository already open stays open.
  useEffect(() => {
    const failed = changes.openError;
    if (!failed) return;
    controller.current?.dismissOpenError();
    const name = failed.path.replace(/\/+$/, "").split("/").pop() || failed.path;
    void showMessage({
      windowId, kind: "warning", title: `“${name}” isn’t in a Git repository.`,
      message: `${failed.path}\n\n${failed.message.replace(/^(error|fatal): /gm, "").trim()}`,
      buttons: [{ id: "choose", label: "Choose Another…" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "choose", cancelButtonId: "cancel",
    }).then(result => { if (result.buttonId === "choose") void chooseRepository(); }, console.error);
  }, [changes.openError]); // eslint-disable-line react-hooks/exhaustive-deps -- once per failed open
  // Changes re-reads status on every ref or HEAD change its watcher sees; the refs follow it.
  useEffect(() => { if (changes.status) void refsController.current?.refresh(); }, [changes.status]);
  useEffect(() => { void stashController.current?.show(selectedStash); }, [selectedStash, root]);
  // Signing in reads the list; signing out clears it. (The mount effect below hands over the token for a window opened later.)
  useEffect(() => { pullsController.current?.setToken(gitHubAccount.token()); }, [gitHub]);
  useEffect(() => { pullsController.current?.select(selectedPullNumber); }, [selectedPullNumber, pulls.pulls]);
  // The selected worktree's files are re-read when it is selected and whenever its count or HEAD changes.
  // Rows are listed only while there are linked worktrees, so a selected main worktree has no row once they are gone.
  const worktreeEntry = selectedWorktree && (refs.worktrees?.length ?? 0) > 1 ? refs.worktrees?.find(entry => entry.path === selectedWorktree) ?? null : null;
  // The selected worktree's files are re-read whenever the worktrees are re-read (any change the watcher sees).
  // A queued worktree shares the preview (its files can be staged and committed there).
  const previewPath = worktreeEntry ? selectedWorktree : queueWorktree?.path ?? null;
  useEffect(() => { void worktreeController.current?.show(previewPath); }, [previewPath, root, refs.worktrees]);
  useEffect(() => {
    if (!sectionShowsHistory(section)) return;
    historyController.current?.setRef(sectionRef(section));
    void historyController.current?.activate();
  }, [section, root]);
  // A queued branch lists its outgoing commits, re-read when its count changes (a commit or a push).
  useEffect(() => {
    if (!queueBranch) return;
    historyController.current?.setRange(queueBranch.ref, queueBranch.base);
    void historyController.current?.activate();
    void historyController.current?.refresh();
  }, [queueBranch?.ref, queueBranch?.base, queueBranch?.ahead, root]); // eslint-disable-line react-hooks/exhaustive-deps -- the entry's identity and count
  // A queue entry that left the queue (committed, pushed, removed) gives way to the same branch's entry, else the first one, else Changes.
  const lastQueued = useRef<QueueEntry | null>(null);
  if (selectedQueue) lastQueued.current = selectedQueue;
  useEffect(() => {
    if (!sectionReview(section) || selectedQueue || !refs.worktrees) return;
    const last = lastQueued.current;
    const branch = last && (last.kind === "branch" ? last.name : last.branch);
    const next = queue.find(entry => entry.kind === "branch" && entry.name === branch) ?? queue[0];
    setSection(next ? `review:${next.id}` : "changes");
  }, [queue, section]); // eslint-disable-line react-hooks/exhaustive-deps -- selectedQueue follows queue and section
  // A selected ref that was deleted or renamed elsewhere falls back to History.
  useEffect(() => {
    const ref = sectionRef(section);
    if (ref && refs.refs && !findRef(refs.refs, ref)) setSection("history");
    // A stash that was popped or dropped falls back to Changes, where popped work shows up.
    const stash = sectionStash(section);
    if (stash && refs.stashes && !refs.stashes.some(entry => entry.oid === stash)) setSection("changes");
    // So does a removed worktree.
    if (sectionWorktree(section) && refs.worktrees && !worktreeEntry) setSection("changes");
  }, [refs.refs, refs.stashes, refs.worktrees, section]); // eslint-disable-line react-hooks/exhaustive-deps -- worktreeEntry follows refs.worktrees
  // A pull request that closed (or a sign-out) falls back to Changes.
  useEffect(() => { if (selectedPullNumber !== null && !selectedPull && !pulls.loading) setSection("changes"); }, [selectedPullNumber, selectedPull, pulls.loading]);

  const [historyActions] = useState<HistoryActions>(() => ({
    select: oid => void historyController.current?.select(oid),
    loadMore: () => void historyController.current?.loadMore(),
    selectFile: path => historyController.current?.selectFile(path),
    copySha: oid => { runCommand("copy-sha", contextRef.current, oid); },
    openOnGitHub: oid => { runCommand("open-github", contextRef.current, oid); },
    contextMenu: (oid, position) => {
      // The row keeps the selection, so Compare with Selected can compare the two.
      showMenu({ target: "commit", oid }, position);
    },
    fileContextMenu: (path, position) => { historyController.current?.selectFile(path); showFileMenu(path, position); },
    columnMenu: (columns, position) => {
      showContextMenu({ windowId, position, items: columnMenuItems(columns) }).then(result => {
        const store = layoutRef.current.store;
        if (!result.canceled && store) return store.edit("user", ["panels", "commitList", "columns"], applyColumnMenu(columns, result.itemId));
      }).catch(console.error);
    },
    columnResize: columns => { void layoutRef.current.store?.edit("user", ["panels", "commitList", "columns"], columns).catch(console.error); },
    closeFileHistory: () => { runCommand("show-all-history", contextRef.current); },
    compare: oid => void historyController.current?.compare(oid),
    swapCompare: () => void historyController.current?.swapCompare(),
    closeCompare: () => historyController.current?.closeCompare(),
    lineChange: target => setBlameTarget(target),
    lineContextMenu: (target, position) => showLineMenu(target, position),
  }));

  function showLineMenu(target: BlameTarget, position: { x: number; y: number }) {
    setBlameTarget(target);
    showMenu({ target: "diffLine" }, position, { ...contextRef.current, canBlame: true }, () => ({ ...contextRef.current, canBlame: !!blameTargetRef.current }));
  }

  /**
   * Shows the settings' context menu for what was clicked (built now, from `contextMenus` or the default list) and runs
   * the picked command on it, with the context it reads when it runs (`runContext`, the current one by default).
   */
  function showMenu(subject: MenuSubject, position: { x: number; y: number }, menuContext = contextRef.current, runContext = () => contextRef.current) {
    const items = contextMenuItems(subject, layoutRef.current.settings.contextMenus, menuContext);
    if (!items.length) return;
    showContextMenu({ windowId, position, items })
      .then(result => { if (!result.canceled) runCommand(result.itemId, runContext(), menuCommandTarget(subject, result.itemId)); }, console.error);
  }

  /** Changes blames added and context lines as on disk (unstaged) or staged, and removed lines one step older. */
  const changesBlameTarget = (target: DiffLineTarget | null): BlameTarget | null => {
    const staged = changes.patch?.section === "staged";
    return target && { ...target, source: target.side === "new" ? staged ? "index" : "workdir" : staged ? "HEAD" : "index" };
  };

  /** A conflicted file's menu leads with the picks that apply to it (its binary state is read first) and Mark Resolved. */
  async function showFileMenu(path: string, position: { x: number; y: number }) {
    let menuContext = contextRef.current;
    const entry = menuContext.conflicts.find(conflict => conflict.path === path);
    if (entry && !(changes.patch?.path === path && changes.patch.conflict)) {
      const file = await controller.current?.conflictFile(path).catch(() => null);
      if (file) menuContext = { ...menuContext, conflicts: menuContext.conflicts.map(conflict => conflict.path === path ? { ...conflict, ...file } : conflict) };
    }
    showMenu({ target: "file", path }, position, menuContext, () => menuContext);
  }

  const showStashMenu = ({ oid, position }: { oid: string; position: { x: number; y: number } }) => showMenu({ target: "stash", oid }, position);
  const showWorktreeMenu = ({ path, position }: { path: string; position: { x: number; y: number } }) => showMenu({ target: "worktree", path }, position);
  const showQueueMenu = ({ entry, position }: { entry: QueueEntry; position: { x: number; y: number } }) => showMenu({ target: "reviewEntry", entry }, position);
  const showPullRequestMenu = ({ number, position }: { number: number; position: { x: number; y: number } }) => showMenu({ target: "pullRequest", number }, position);

  function showRefMenu({ ref, position }: { ref: string; position: { x: number; y: number } }) {
    const entry = findRef(contextRef.current.refs, ref);
    if (!entry) return;
    const target = entry.kind === "remote" ? "remoteBranch" : entry.kind;
    showMenu({ target, ref, name: entry.ref.name, current: entry.kind === "branch" && entry.ref.current }, position);
  }

  // A ref deleted or renamed since it was selected has no row; History is shown until the effect above moves there.
  const sidebarSection = sectionRef(section) && !findRef(refs.refs, sectionRef(section)) ? "history"
    : selectedStash && !refs.stashes?.some(entry => entry.oid === selectedStash) ? "changes"
    : selectedWorktree && !worktreeEntry ? "changes"
    : sectionReview(section) && !selectedQueue ? "changes"
    : selectedPullNumber !== null && !selectedPull ? "changes" : section;
  const branch = changes.status?.branch;
  // A rebase detaches HEAD while it runs; the branch it rebases keeps the label.
  const branchLabel = !branch?.head ? null : branch.head !== "(detached)" ? branch.head
    : operation?.kind === "rebase" && operation.branch ? operation.branch : `${branch.oid?.slice(0, 7) ?? "HEAD"} (detached)`;
  const networkText = networkStatusText(network, root ? branch : null);
  const aheadBehindTooltip = `${branch?.behind ?? 0} incoming and ${branch?.ahead ?? 0} outgoing commits on “${branch?.upstream}”`;
  // The settings' items (a preset's or the user's); the slots keep their identity while `toolbar` does.
  const slots = useMemo(() => toolbarSlots(layout.settings.toolbar), [layout.settings.toolbar]);
  const toolbarItemList: MacOSToolbarItem[] = toolbarItems(slots, context, {
    branchPicker: () => [{ type: "menu", id: "branch", label: branchLabel ?? "Branch", symbol: "arrow.triangle.branch", tooltip: "Current branch", items: [
      ...recentBranches(context.refs).map(branch => ({ type: "checkbox" as const, id: `checkout:${branch.ref}`, label: branch.name, checked: branch.current, disabled: branch.current || !commandEnabled("checkout-ref", context, branch.ref) && !branch.current })),
      ...context.refs?.branches.length ? [{ type: "separator" as const }] : [],
      commandMenuItem("switch-branch", context, { shortcut: false }),
      commandMenuItem("new-branch", context, { shortcut: false }),
    ] }],
    viewSwitcher: () => [{ type: "segmented", id: "section", label: "View", value: section === "changes" || section === "history" ? section : null, segments: [
      { value: "changes", label: "Changes", symbol: "square.and.pencil" },
      { value: "history", label: "History", symbol: "clock" },
    ] }],
    // Its status label shows the running operation's progress, or ↓behind ↑ahead.
    networkProgress: () => network.operation ? [{ type: "label", id: "network-progress", label: `${networkVerb(network.operation)}…`, text: `${networkVerb(network.operation)}…`, width: 180 }]
      : networkText ? [{ type: "label", id: "ahead-behind", label: `${aheadBehindTooltip}`, text: networkText }] : [],
    // AppKit's NSSearchToolbarItem (it collapses itself when the toolbar is narrow); Spark's `collapses` button ignores real clicks (Spark ask).
    // History searches everything at once; qualifiers (author:, path:, before:, …) narrow it (historyQuery.ts).
    search: () => [{ type: "search", id: "search", label: "Search", placeholder: showsHistory ? historyQueryHint : "Filter Files", width: showsHistory ? 260 : 200 }],
  });
  // The search field keeps its own text; it is passed only when the toolbar is rebuilt (a section switch or Show All).
  const searchText = showsHistory ? historyQuery : filter;
  // Progress text changes go to the label alone (below); a rebuilt toolbar carries the current text.
  const toolbar = { visible: true, style: "unified" as const, items: toolbarItemList.map(entry => entry.type === "search" ? { ...entry, value: searchText } : entry.id === "network-progress" ? { ...entry, text: networkText } : entry) };
  const toolbarRef = useRef(toolbar);
  toolbarRef.current = toolbar;
  // Title bar options go once: re-sending them grows the window by 20 pt each time (Spark ask).
  // The settings' appearance (system, light or dark) is the window's, so title bar, toolbar and system colors follow it.
  const appearance = layout.settings.appearance;
  const sentAppearance = useRef(appearance);
  useEffect(() => {
    void setWindowOptions(windowId, { appearance, macos: { titleBar: { contentLayout: "fullSize", transparent: true, titleVisibility: "visible" } } }).catch(console.error);
  }, []);
  useEffect(() => {
    if (sentAppearance.current === appearance) return;
    sentAppearance.current = appearance;
    void setWindowOptions(windowId, { appearance }).catch(console.error);
  }, [appearance]); // eslint-disable-line react-hooks/exhaustive-deps -- windowId is fixed
  useEffect(() => {
    void setWindowOptions(windowId, {
      // A worktree window is titled after the repository and its branch, so the Window menu tells worktrees apart.
      title: root && repoName ? `${repoName} — ${branchLabel ?? worktreeName(root)}` : root ? `${root.split("/").pop()} — Legend Git` : "Legend Git",
      macos: {
        // Omitted, not null, without a repository: a null URI also clears the window title. A worktree window has none,
        // since AppKit then titles the window with the folder's name instead of "<repo> — <branch>".
        ...(root && !repoName ? { representedUri: `file://${root.split("/").map(encodeURIComponent).join("/")}` } : {}),
        toolbar: toolbarRef.current,
      },
    }).catch(console.error);
  }, [root, repoName ? branchLabel : null]); // eslint-disable-line react-hooks/exhaustive-deps -- the branch only titles worktree windows
  // Item changes (settings, section, labels, availability) update only the toolbar; an unchanged toolbar sends nothing.
  const toolbarKey = JSON.stringify([toolbarItemList, searchEpoch]);
  const toolbarShown = useRef(toolbarKey);
  useEffect(() => {
    if (toolbarShown.current === toolbarKey) return;
    toolbarShown.current = toolbarKey;
    void setWindowOptions(windowId, { macos: { toolbar: toolbarRef.current } }).catch(console.error);
  }, [toolbarKey]);

  useEffect(() => {
    if (network.operation) setToolbarItemText(windowId, "network-progress", networkText).catch(() => { /* not in the toolbar yet; the rebuild carries the text */ });
  }, [networkText]); // eslint-disable-line react-hooks/exhaustive-deps -- only the text

  useEffect(() => {
    let disposed = false;
    const owner = createGitChanges(setChanges, watchDirectories);
    controller.current = owner;
    const historyOwner = createGitHistory(setHistory, watchDirectories);
    historyController.current = historyOwner;
    const refsOwner = createGitRefs(setRefs);
    refsController.current = refsOwner;
    const stashOwner = createStashPreview(setStashPreview);
    stashController.current = stashOwner;
    const worktreeOwner = createWorktreePreview(setWorktreePreview);
    worktreeController.current = worktreeOwner;
    const networkOwner = createGitNetwork(setNetwork);
    networkController.current = networkOwner;
    const pullsOwner = createPullRequests(setPulls);
    pullsController.current = pullsOwner;
    pullsOwner.setToken(gitHubAccount.token());
    const registration = addMacOSWindowListener(windowId, event => {
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
        if (!sectionShowsHistory(contextRef.current.section)) setFilter(event.value);
        else {
          setHistoryQuery(event.value);
          historyOwner.search(event.value);
        }
      }
    });
    // Closing the window (or unmounting) cancels its reads and removes its watchers.
    const close = () => {
      if (disposed) return;
      disposed = true;
      generator.current?.reset();
      for (const disposable of [owner, historyOwner, refsOwner, stashOwner, worktreeOwner, networkOwner, pullsOwner]) disposable.dispose();
      controller.current = null;
      historyController.current = null;
      refsController.current = null;
      stashController.current = null;
      worktreeController.current = null;
      networkController.current = null;
      pullsController.current = null;
      closeMenuWindow(windowId);
      if (initialPath) openWorktreePaths.delete(initialPath);
      for (const pending of [registration, closeRegistration, focusRegistration, ...openRequests ? [openRequests] : []]) void pending.then(listener => listener.remove()).catch(console.error);
    };
    registerMenuRunner(windowId, itemId => {
      if (disposed) return;
      if (itemId.startsWith("layout:")) void runLayoutAction(itemId, {
        windowId, layout: layoutRef.current, kind: viewKindFor(contextRef.current.section), focused: focusedPanel.current,
        onReset: () => setLayoutRevision(value => value + 1),
      });
      else if (itemId.startsWith("diff:")) { const store = layoutRef.current.store; if (store) runDiffAction(itemId, store).catch(console.error); }
      else if (itemId === "settings" || itemId === "customize-toolbar") openSettingsWindow(rootRef.current, itemId === "settings" ? undefined : "toolbar").catch(console.error);
      else runCommand(itemId, contextRef.current);
    });
    const closeRegistration = addWindowListener(windowId, "closed", close);
    // Pull requests re-read when the window comes to the front (and on ⌘R), never on a timer.
    const focusRegistration = addWindowListener(windowId, "focusChanged", event => {
      if (disposed || !event.focused) return;
      setMenuWindow(windowId);
      void pullsOwner.refresh({ focus: true });
    });
    // File ▸ Open Recent (AppKit's, filled from the system's recent documents) and folders opened from Finder arrive as
    // open requests; the main window opens them, so a worktree window keeps its worktree.
    const openRequests = windowId === mainWindowId ? subscribeToOpenRequests(event => {
      if (disposed || event.type !== "file") return;
      void owner.open(event.path);
    }) : null;
    for (const pending of [registration, closeRegistration, focusRegistration, ...openRequests ? [openRequests] : []]) void pending.catch(console.error);
    if (initialPath) { openWorktreePaths.add(initialPath); setMenuWindow(windowId); void owner.open(initialPath); }
    return close;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- one window, one set of controllers

  const unstagedList = <ChangesList title="Unstaged" entries={unstaged.filter(matches("unstaged"))} filtered={!!filter} selectedPath={selected?.section === "unstaged" ? selected.path : null}
    onSelect={path => void selectChange(path === null ? null : { section: "unstaged", path })}
    action="Stage" disabled={busy} onAction={path => { if (context.conflicts.some(entry => entry.path === path)) void markResolved(path); else void controller.current?.changeFile(path, true); }} onContextMenu={showFileMenu}
    secondaryAction="Discard…" secondaryDisabled={!canDiscardFile} onSecondaryAction={() => void discardFile()} />;
  const stagedList = <ChangesList title="Staged" entries={staged.filter(matches("staged"))} filtered={!!filter} selectedPath={selected?.section === "staged" ? selected.path : null}
    onSelect={path => void selectChange(path === null ? null : { section: "staged", path })}
    action="Unstage" disabled={busy} onAction={path => void controller.current?.changeFile(path, false)} onContextMenu={showFileMenu} />;
  const composer = <CommitComposer disabled={busy} stagedCount={staged.length} conflictCount={conflicts} merging={changes.merging} prepared={preparedMessage} unborn={changes.status?.branch.oid === "(initial)"} root={root!}
      commitRef={commit} onCommit={input => controller.current?.commit(input) ?? Promise.resolve(false)} headMessage={() => controller.current?.headMessage() ?? Promise.resolve(null)}
      mergeMessage={() => controller.current?.mergeMessage() ?? Promise.resolve(null)} editedMergeMessageRef={editedMergeMessage}
      readStaged={signal => controller.current?.stagedDiff(signal) ?? Promise.reject(new Error("Open a repository first."))}
      confirmReplace={() => confirmDestructive(windowId, "Replace the commit message?", "Replace", "The generated message replaces the summary and description you wrote.")}
      generatorRef={generator} onGeneratingChange={setGenerating} />;

  const stashEntry = selectedStash ? refs.stashes?.find(entry => entry.oid === selectedStash) ?? null : null;
  const stashFile = stashPreview.oid === selectedStash ? stashPreview.files.find(file => file.path === stashPreview.selectedPath) : undefined;
  const stashButton = (id: "apply-stash" | "pop-stash" | "drop-stash", label: string) => stashEntry
    ? <Button style={styles.action} disabled={!commandEnabled(id, context, stashEntry.oid)} onPress={() => runCommand(id, contextRef.current, stashEntry.oid)}>{label}</Button> : null;
  const stashButtons = <>{stashButton("apply-stash", "Apply")}{stashButton("pop-stash", "Pop")}{stashButton("drop-stash", "Drop…")}</>;
  const stashDetail = stashFile
    ? <DiffPane readOnly disabled patch={{ path: stashFile.path, text: stashFile.text, file: stashFile.file, section: "unstaged", conflicted: false }} onApply={() => {}} accessory={stashButtons} />
    : <EmptyState title={stashPreview.loading ? "Loading Stash…" : stashPreview.error ? "Couldn’t Read the Stash" : "No Changes"} message={stashPreview.error ?? undefined}>
      {stashPreview.loading ? null : <View style={styles.stashButtons}>{stashButtons}</View>}
    </EmptyState>;

  const worktreeOpenButton = worktreeEntry && commandEnabled("open-worktree", context, worktreeEntry.path)
    ? <Button style={styles.openWindow} onPress={() => runCommand("open-worktree", contextRef.current, worktreeEntry.path)}>Open in New Window</Button> : null;
  const worktreePatch = worktreePreview.path === previewPath ? worktreePreview.patch : null;
  // The selected file of a queued worktree: Unstage when all its changes are staged, else Stage.
  const queueFile = queueWorktree && worktreePreview.path === queueWorktree.path ? worktreePreview.files.find(file => file.path === worktreePreview.selectedPath) : undefined;
  const queueUnstage = !!queueFile && queueFile.kind !== "untracked" && queueFile.worktreeStatus === ".";
  const queueStageButton = queueWorktree ? <Button style={styles.action} disabled={!queueFile || worktreePreview.writing || queueFile.kind === "unmerged"}
    onPress={() => { if (queueFile) void changeQueueFile(queueFile.path, !queueUnstage); }}>{queueUnstage ? "Unstage" : "Stage"}</Button> : null;
  const queuePushButton = selectedQueue ? <Button style={styles.action} disabled={!commandEnabled("push-review", context)} onPress={() => runCommand("push-review", contextRef.current)}>
    {queuePushTarget(selectedQueue)?.publish ? "Publish…" : "Push"}</Button> : null;
  const worktreeDetailPane = worktreePatch
    ? <DiffPane readOnly disabled patch={{ path: worktreePatch.path, text: worktreePatch.text, file: worktreePatch.file, section: "unstaged", conflicted: false }} onApply={() => {}} />
    : <EmptyState title={worktreePreview.loading ? "Loading Worktree…" : worktreePreview.error ? "Couldn’t Read the Worktree" : worktreePreview.files.length ? "No Selection" : "Working Tree Clean"}
      symbol={!worktreePreview.loading && !worktreePreview.error && !worktreePreview.files.length ? "checkmark.circle" : undefined} message={worktreePreview.error ?? undefined} />;

  // Threads or reviews GitHub refused to read; the files may still show.
  const detailError = pulls.threadsError ?? pulls.reviewsError;
  const pullFile = selectedPull && pulls.number === selectedPull.number ? pulls.files?.find(file => file.path === pulls.selectedPath) : undefined;
  const placed = pullFile ? placeThreads(pulls.threads ?? [], pullFile.path, pullFile.file) : null;
  const threadView = (thread: ReviewThread, aboveDiff?: boolean) => <ReviewThreadView key={thread.id} thread={thread} aboveDiff={aboveDiff} disabled={pulls.writing} onReply={replyToThread} />;
  const annotations = useMemo(() => new Map([...placed?.byKey ?? []].map(([key, threads]) => [key, <>{threads.map(thread => threadView(thread))}</>])), [pulls.threads, pullFile, pulls.writing]); // eslint-disable-line react-hooks/exhaustive-deps -- placed and threadView follow these
  const pullDetail = pullFile?.text
    ? <DiffPane readOnly disabled patch={{ path: pullFile.path, text: pullFile.text, file: pullFile.file, section: "unstaged", conflicted: false }} onApply={() => {}}
      annotations={annotations} header={placed?.unplaced.length ? <View style={styles.unplaced}>{placed.unplaced.map(thread => threadView(thread, true))}</View> : null}
      onRangeChange={setPullRange}
      accessory={<Button style={styles.addComment} disabled={!pullRange || pulls.writing} onPress={addPullComment}>Add Comment…</Button>} />
    : <EmptyState title={pulls.filesLoading && !pulls.files ? "Loading Pull Request…" : pulls.filesError ? "Couldn’t Read the Pull Request" : pullFile?.error ? "Couldn’t Show the Diff" : pullFile ? "No Diff to Show" : pulls.files?.length === 0 ? "No Changes" : "No Selection"}
      message={pulls.filesError ?? pullFile?.error ?? (pullFile ? "GitHub doesn’t show a diff for this file (binary, or too large)." : undefined)} />;

  // A conflicted file's header offers the picks that apply to it, then Mark Resolved.
  const conflictPath = changes.patch?.conflicted ? changes.patch.path : null;
  const conflict = conflictList.find(entry => entry.path === conflictPath);
  const resolveButton = conflictPath ? <>
    {conflict && (["ours", "theirs", "both"] as const).filter(side => conflictPickable(conflict, side)).map(side => {
      const id = `use-${side}` as const;
      return <PickButton key={id} label={commandLabel(id, context, conflictPath)} disabled={!commandEnabled(id, context, conflictPath)} onPress={() => runCommand(id, contextRef.current, conflictPath)} />;
    })}
    <Button style={styles.markResolved} disabled={!commandEnabled("mark-resolved", context, conflictPath)}
      onPress={() => runCommand("mark-resolved", contextRef.current, conflictPath)}>Mark Resolved</Button>
  </> : null;
  const changesDetail = changes.patch ? <DiffPane patch={changes.patch} disabled={busy} applyRef={applyLines} discardRef={discardLines} accessory={resolveButton}
    conflictLabels={{ ours: conflictSideName(operation, "ours"), theirs: conflictSideName(operation, "theirs") }}
    onPickRegion={async (index, side, shown) => {
      if (!conflictPath || !await discardResultFor(conflictPath, side === "both" ? "Use Both" : `Use ${conflictSideName(operation, side)}`)) return;
      await controller.current?.resolveConflictRegion(conflictPath, index, side, shown);
    }}
    result={{ store: resultDraft, onSave: saveResult }}
    onLineChange={target => setBlameTarget(changesBlameTarget(target))}
    onLineContextMenu={(target, position) => { const blame = changesBlameTarget(target); if (blame) showLineMenu(blame, position); }}
    onApply={(keys, text) => void controller.current?.changeLines(keys, text)}
    onDiscard={async (keys, text, what) => { if (await confirmDestructive(windowId, `Discard ${what}?`, "Discard")) await controller.current?.discardLines(keys, text); }} />
    : selected ? <EmptyState title="Loading Diff…" />
    : unstaged.length || staged.length ? <EmptyState title="No Selection" message="Select a file to view its changes." />
    : <EmptyState symbol="checkmark.circle" title="Working Tree Clean" message="There are no changes to commit." />;

  // Panels by layout id (spec §5.4). Controllers own the state outside React, so a panel the layout moves remounts cheaply.
  const kind = viewKindFor(section);
  const changesActive = kind === "changes";
  const listPanel = (content: ReactNode) => <View style={styles.panel}>{content}</View>;
  const historyList = (id: string) => <HistoryList history={history} actions={historyActions} memory={layout.memory(id)} />;
  const changesPanels: PanelRenderers = {
    unstaged: () => listPanel(unstagedList),
    staged: () => listPanel(stagedList),
    changes: () => listPanel(<>{unstagedList}{stagedList}</>),
    composer: () => listPanel(<ScrollView>{composer}</ScrollView>),
    // Shown only while Changes is: the hidden copy keeps the composer, not a second diff or graph.
    diff: () => changesActive ? changesDetail : null,
    commitList: ({ id }) => changesActive ? listPanel(historyList(id)) : null,
    empty: () => null,
  };
  const historyPanels: PanelRenderers = {
    commitList: ({ id }) => listPanel(queueBranch ? <>
      <View style={[styles.heading, styles.tallHeading]}>
        <View style={styles.headingStack}>
          <Text style={[styles.headingLabel, styles.fixed]} accessibilityRole="header" numberOfLines={1}>{queueBranch.name}</Text>
          <Text style={styles.headingNote} numberOfLines={1}>{`${queueBranch.ahead === 1 ? "1 commit" : `${queueBranch.ahead} commits`} not on ${queueBranch.upstream ?? queueBranch.base.replace(/^refs\/(heads|remotes)\//, "")}`}</Text>
        </View>
        {queuePushButton}
      </View>
      <View style={[styles.root, styles.separated]}>{historyList(id)}</View>
    </> : historyList(id)),
    commitDetails: () => <CommitInfo history={history} actions={historyActions} />,
    fileList: () => listPanel(<CommitFiles history={history} actions={historyActions} />),
    diff: () => <CommitFileDiff history={history} actions={historyActions} />,
    empty: () => null,
  };
  const sectionPanels: PanelRenderers = showsHistory || queueBranch ? historyPanels
    : stashEntry ? { fileList: () => listPanel(<StashFiles stash={stashEntry} preview={stashPreview} filter={filter} onSelect={path => stashController.current?.selectFile(path)} />), diff: () => stashDetail, empty: () => null }
    : worktreeEntry ? { fileList: () => listPanel(<WorktreeFiles worktree={worktreeEntry} preview={worktreePreview} filter={filter} accessory={worktreeOpenButton} onSelect={path => worktreeController.current?.selectFile(path)} />), diff: () => worktreeDetailPane, empty: () => null }
    : queueWorktree ? { fileList: () => listPanel(<>
      <WorktreeFiles worktree={queueWorktree} title={queueWorktree.branch ? `${queueWorktree.name} — ${queueWorktree.branch}` : queueWorktree.name} preview={worktreePreview} filter={filter}
        accessory={queueStageButton} onSelect={path => worktreeController.current?.selectFile(path)} />
      <View style={styles.queueBar}>
        {commandEnabled("open-worktree", context, queueWorktree.path) ? <Button style={styles.queueOpen} onPress={() => runCommand("open-worktree", contextRef.current, queueWorktree.path)}>Open Window</Button> : null}
        <View style={styles.root} />
        {queuePushButton}
        <Button style={styles.discard} disabled={!commandEnabled("commit", context)} onPress={() => runCommand("commit", contextRef.current)}>Commit…</Button>
      </View>
    </>), diff: () => worktreeDetailPane, empty: () => null }
    : selectedPull ? { fileList: () => listPanel(<PullRequestFiles pull={selectedPull} state={pulls} filter={filter} onSelect={path => pullsController.current?.selectFile(path)}
      review={<>
        {selectedPull.url ? <Button style={styles.openPull} onPress={() => runCommand("open-github", contextRef.current)}>Open on GitHub</Button> : null}
        <Button style={styles.action} disabled={!commandEnabled("review-pull-request", context)} onPress={() => runCommand("review-pull-request", contextRef.current)}>Review…</Button>
      </>} />), diff: () => pullDetail, empty: () => null }
    : { empty: () => null };
  const has = (panels: PanelRenderers) => (panel: PanelId) => !!panels[panel];
  const changesConditions: LayoutConditions = { fileSelected: !!selected, commitSelected: !!history.selectedOid, operationInProgress: !!operation };
  const sectionConditions: LayoutConditions = {
    fileSelected: showsHistory || queueBranch ? !!(history.compare ? history.compare.selectedPath : history.details?.selectedPath)
      : stashEntry ? !!stashPreview.selectedPath : worktreeEntry || queueWorktree ? !!worktreePreview.selectedPath : selectedPull ? !!pulls.selectedPath : false,
    commitSelected: !!(queueBranch ? history.selectedOid : selectedCommit), operationInProgress: !!operation,
  };
  const focusPanel = (id: string) => { focusedPanel.current = id; setFocusedPanelId(id); };
  const activeLayoutId = activeLayoutName(layout.settings, layout.base);
  const sidebarLayout = `${activeLayoutId}:${layoutRevision}`;
  const activeSidebar = activeLayout(layout.settings, layout.base).sidebar;
  // Spark throws when the width is below the minimum; a remembered width or a settings file can be.
  const sidebarMinWidth = activeSidebar?.minWidth ?? 180;
  const sidebarWidth = Math.max(activePaneSizes(layout.settings, layout.base).sidebar?.[0] ?? layout.windowState?.get().sidebarWidth ?? activeSidebar?.width ?? 220, sidebarMinWidth);
  const settingsContext = useMemo(() => ({ settings$: layout.settings$, store: layout.store }), [layout.settings$, layout.store]);
  const changesPlan = windowPlan(layout.settings, layout.base, "changes", changesConditions, has(changesPanels));
  // A layout that shows the graph in Changes (GitKraken) needs HEAD's log loaded, as History does.
  const changesGraph = !!root && kind === "changes" && planPanels(changesPlan).includes("commitList");
  useEffect(() => {
    if (!changesGraph) return;
    historyController.current?.setRef(null);
    void historyController.current?.activate();
  }, [changesGraph, root]);

  const sectionCounts = {
    reviewQueue: queue.length, branches: refs.refs?.branches.length, remotes: refs.refs?.remotes.reduce((total, remote) => total + remote.branches.length, 0),
    tags: refs.refs?.tags.length, stashes: refs.stashes?.length, worktrees: refs.worktrees?.length, pullRequests: pulls.pulls?.length,
  };
  const sidebarPlan = sidebarSections(layout.settings.sidebar, sectionCounts, expandedSections);
  // A selection made elsewhere (View ▸ Review Queue, a checkout) shows its row: a collapsed section opens.
  const selectedGroup = sectionOfRow(sidebarSection);
  useEffect(() => {
    if (root && selectedGroup && sidebarPlan.some(entry => entry.id === selectedGroup && !entry.expanded)) setSectionExpanded(selectedGroup, true);
  }, [section]); // eslint-disable-line react-hooks/exhaustive-deps -- only a new selection reveals; collapsing the selected row's section keeps it collapsed
  const showCounts = layout.settings.sidebar.showCounts;
  const sidebarRows = (id: SidebarSectionId): ReactElement[] => {
    switch (id) {
      case "workspace": return [
        <SidebarItem key="changes" id="changes"><SidebarRow symbol="square.and.pencil" label="Changes" count={showCounts ? changes.status?.entries.length : undefined} /></SidebarItem>,
        <SidebarItem key="history" id="history"><SidebarRow symbol="clock" label="History" /></SidebarItem>,
      ];
      case "reviewQueue": return queueSidebarItems(queue, showQueueMenu);
      case "branches": case "remotes": case "tags": return refSidebarItems(id, refs.refs, ref => showRefMenu(ref), gitHub.status === "signed-in" ? pulls.merged : {});
      case "stashes": return stashSidebarItems(refs.stashes, showStashMenu);
      case "worktrees": return worktreeSidebarItems(refs.worktrees, root, showWorktreeMenu);
      case "pullRequests": return pullRequestSidebarItems(pulls, gitHub.status, showPullRequestMenu);
    }
  };
  const sidebarItems = root ? sidebarPlan.flatMap(({ id, expanded }) => {
    const rows = sidebarRows(id);
    if (id === "workspace" || !rows.length) return rows;
    return [
      <SidebarItem key={`group:${id}`} id={`group:${id}`} selectable={false}>
        <SectionHeader title={sectionTitles[id]} count={showCounts ? sectionCounts[id] : undefined} hint={id === "reviewQueue" ? queueNote : undefined}
          expanded={expanded} onToggle={() => setSectionExpanded(id, !expanded)} />
      </SidebarItem>,
      ...expanded ? rows : [],
    ];
  }) : [];
  // Spark requires the selected ID to be a row in the list; a row in a collapsed section has none.
  const sidebarSelected = root && sidebarItems.some(item => (item.props as { id: string }).id === sidebarSection) ? sidebarSection : null;

  return (<SettingsContext.Provider value={settingsContext}>
    {windowId === mainWindowId ? <GitMenu menu={menu} /> : null}
    {Object.keys(routedKeys).length ? <KeyBindingRouter windowId={windowId} bindings={routedKeys} run={id => runCommand(id, contextRef.current)} /> : null}
    {/* Starts at the remembered sidebar width, so the split view waits for the window state (one small file). */}
    {/* The window's own background behind the panes: the source list's glass material shows what is behind it, and
        Spark's root material is clear, so without it the sidebar showed the desktop (white in a dark window). */}
    {layoutReady ? <View style={styles.window}><SidebarSplitView
      key={layoutRevision}
      appearance={layout.settings.appearance}
      style={styles.root}
      sidebarWidth={sidebarWidth}
      sidebarMinWidth={sidebarMinWidth}
      contentMinWidth={480}
      sidebarCollapsed={sidebarCollapsed}
      onSidebarCollapsedChange={changeSidebarCollapsed}
      onResize={event => {
        if (event.phase !== "ready") return;
        const sizes = [event.sidebarWidth, event.contentWidth] as const;
        const before = sidebarMetrics.current;
        sidebarMetrics.current = { layout: sidebarLayout, requested: sidebarWidth, sizes };
        if (before?.layout === sidebarLayout && before.sizes[0] > 0 && event.sidebarWidth > 0
          && (before.requested === sidebarWidth || Math.round(before.sizes[0]) === sidebarWidth)
          && Math.round(event.sidebarWidth) !== sidebarWidth && isDividerResize(before.sizes, sizes)) {
          layout.paneSizes.onPaneResize("sidebar", [event.sidebarWidth]);
        }
      }}
      titleBar={{ content: { height: contentInset, material: "titlebar" } }}
      sidebar={
        <Sidebar style={styles.root} selectedId={sidebarSelected} onSelectionChange={event => {
          if (event.id?.startsWith("recent:")) runCommand("open-recent", contextRef.current, event.id.slice(7));
          else if (event.id === "github-sign-in") runCommand("sign-in-github", contextRef.current);
          else if (event.id === "changes" || event.id === "history" || event.id?.startsWith("ref:") || event.id?.startsWith("stash:") || event.id?.startsWith("worktree:") || event.id?.startsWith("review:") || event.id?.startsWith("pr:")) setSection(event.id as Section);
        }} contentInsetTop={contentInset}>
          {/* Starts right under the title bar, at the same height with or without a repository (as Diff's sidebar). */}
          <SidebarItem id="repositories" selectable={false} rowHeight={24}>
            <Text style={styles.section}>{root?.split("/").pop() ?? (recents.length ? "Recent" : "Repositories")}</Text>
          </SidebarItem>
          {root ? sidebarItems : recents.length ? recentLabels(recents).map((label, index) => <SidebarItem key={recents[index]} id={`recent:${recents[index]}`}>
            <SidebarRow symbol="folder" label={label} />
          </SidebarItem>) :
            <SidebarItem id="empty" selectable={false}><Text style={styles.sidebarNote}>No repository open</Text></SidebarItem>}
        </Sidebar>
      }
      content={
        <View style={styles.content}>
          {/* The operation bar (merge, rebase, …) and Git's errors sit across the top of the detail. */}
          {operation ? <StateBar tone="warning" text={operationText(operation)}>
            <Button style={styles.barButton} disabled={!commandEnabled("abort-operation", context)} onPress={() => runCommand("abort-operation", contextRef.current)}>{operation.kind === "bisect" ? "Stop…" : "Abort…"}</Button>
            {operation.kind !== "bisect" ? <Button style={styles.barButton} disabled={!commandEnabled("continue-operation", context)} onPress={() => runCommand("continue-operation", contextRef.current)}>Continue</Button> : null}
          </StateBar> : null}
          {changes.error ? <StateBar tone="error" text={changes.error} /> : null}
          {root && pulls.error ? <StateBar tone="error" text={pulls.error.message}>
            {pulls.error.kind === "unauthorized" ? <Button style={styles.barButton} onPress={() => runCommand("sign-in-github", contextRef.current)}>Sign In…</Button>
              : <Button style={styles.barButton} disabled={pulls.loading} onPress={() => void pullsController.current?.refresh()}>Try Again</Button>}
          </StateBar> : null}
          {/* A refused token fails every read; one bar says so. */}
          {selectedPull && detailError && !pulls.error ? <StateBar tone="error" text={detailError.message}>
            {detailError.kind === "unauthorized" ? <Button style={styles.barButton} onPress={() => runCommand("sign-in-github", contextRef.current)}>Sign In…</Button>
              : <Button style={styles.barButton} onPress={() => void pullsController.current?.refresh()}>Try Again</Button>}
          </StateBar> : null}
          {root ? <View style={styles.detail}>
            <DiffDocumentCacheContext.Provider value={layout.documents}>
              {/* Changes stays mounted (hidden) in other sections so the commit message draft and a running generation survive a switch. */}
              <View style={[styles.root, kind !== "changes" && styles.hidden]}>
                <LayoutHost key={activeLayoutId} plan={changesPlan} panels={changesPanels} onFocusPanel={focusPanel} onPaneResize={layout.paneSizes.onPaneResize} />
              </View>
              {kind !== "changes" ? <LayoutHost key={activeLayoutId} plan={windowPlan(layout.settings, layout.base, kind, sectionConditions, has(sectionPanels))} panels={sectionPanels} onFocusPanel={focusPanel} onPaneResize={layout.paneSizes.onPaneResize} /> : null}
            </DiffDocumentCacheContext.Provider>
          </View>
            : changes.loading ? <EmptyState title="Opening Repository…" />
            : <EmptyState symbol="folder" title="No Repository Open" message="Open a Git repository to see its changes and commit them.">
              <Button style={styles.open} onPress={() => void chooseRepository()}>Open Repository…</Button>
            </EmptyState>}
          {commentSheet && selectedPull ? <CommentSheet key={commentSheet.review ? "review" : commentSheet.title + commentSheet.context} top={contentInset} title={commentSheet.title} context={commentSheet.context} busy={pulls.writing}
            review={commentSheet.review} onCancel={() => setCommentSheet(null)} onSubmit={(body, event) => void postComment(commentSheet, body, event)} /> : null}
          {rebaseSheet && root ? <InteractiveRebaseSheet key={rebaseSheet.plan.head + rebaseSheet.plan.base} top={contentInset} plan={rebaseSheet.plan} onto={rebaseSheet.onto} busy={rebasing}
            onCancel={() => setRebaseSheet(null)} onStart={(todo, updateRefs) => void startInteractiveRebase(todo, updateRefs)} /> : null}
          {createSheet && root ? <CreatePullRequestSheet key={createSheet.branch} top={contentInset} branch={createSheet.branch} bases={createSheet.bases} base={createSheet.base} title={createSheet.title}
            busy={creating || pulls.writing} onCancel={() => setCreateSheet(null)} onSubmit={input => void submitCreatePullRequest(input)} /> : null}
        </View>
      }
    /></View> : null}
  </SettingsContext.Provider>);
}

/** The app's menu bar, installed once by the main window for the Git window focused last (see useMenuBar). */
function GitMenu({ menu }: { menu: UseMenuOptions }) {
  useMenu(useMenuBar(menu));
  return null;
}

function SidebarRow({ symbol, label, count, current, indent, detail }: { symbol: string; label: string; count?: number; current?: boolean; indent?: boolean; detail?: string }) {
  const color = useSymbolColor("blue");
  const secondary = useSymbolColor("secondary");
  return <View style={[styles.sidebarRow, indent && styles.indented]} accessible accessibilityLabel={count ? `${label}, ${count}` : current ? `${label}${detail ? `, ${detail}, current` : ", current branch"}` : detail ? `${label}, ${detail}` : label}>
    <View style={styles.sidebarIcon}><SFSymbol name={symbol} color={color} size={15} /></View>
    <Text style={styles.label} numberOfLines={1}>{label}</Text>
    {/* A concrete color: secondaryLabelColor nearly vanishes on the main window's vibrant sidebar. */}
    {count ? <Text style={[styles.count, { color: secondary }]}>{count}</Text> : null}
    {detail ? <Text style={[styles.count, { color: secondary }]} numberOfLines={1}>{detail}</Text> : null}
    {current ? <SFSymbol name="checkmark" color={secondary} size={12} /> : null}
  </View>;
}

/** What the Review Queue lists, under its header. */
const queueNote = "Uncommitted worktrees and unpushed branches";

const sectionTitles: Record<Exclude<SidebarSectionId, "workspace">, string> = {
  reviewQueue: "Review Queue", branches: "Branches", remotes: "Remotes", tags: "Tags", stashes: "Stashes", worktrees: "Worktrees", pullRequests: "Pull Requests",
};

/**
 * A section's header: its title and count, and a disclosure chevron; clicking it expands or collapses the section. The
 * source list's table keeps clicks from React views in its rows, so an invisible native button over the header takes them.
 */
function SectionHeader({ title, count, hint, expanded, onToggle }: { title: string; count?: number; hint?: string; expanded: boolean; onToggle: () => void }) {
  const secondary = useSymbolColor("secondary");
  return <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: secondary }]} numberOfLines={1} accessible={false}>{title}</Text>
    {count ? <Text style={[styles.sectionCount, { color: secondary }]} accessible={false}>{count}</Text> : null}
    <SFSymbol name={expanded ? "chevron.down" : "chevron.right"} color={secondary} size={10} />
    <Button variant="borderless" style={styles.sectionToggle} onPress={onToggle}
      accessibilityLabel={`${count ? `${title}, ${count}` : title}, ${expanded ? "expanded" : "collapsed"}${hint ? `. ${hint}` : ""}`}>{title}</Button>
  </View>;
}

/** One ref section's rows: Branches, Remotes (each remote, then its branches) or Tags; none when it is empty. */
function refSidebarItems(section: "branches" | "remotes" | "tags", refs: GitRefList | null, onContextMenu: (event: { ref: string; position: { x: number; y: number } }) => void, merged: PullRequestsState["merged"]) {
  if (!refs) return [];
  const row = (ref: string, symbol: string, label: string, options: { current?: boolean; indent?: boolean; detail?: string } = {}) =>
    <SidebarItem key={ref} id={`ref:${ref}`} onContextMenu={event => onContextMenu({ ref, position: event.windowPosition })}>
      <SidebarRow symbol={symbol} label={label} current={options.current} indent={options.indent} detail={options.detail} />
    </SidebarItem>;
  // Only while the branch is still at the tip that was checked.
  const mergedDetail = (branch: GitRefList["branches"][number]) => merged[branch.name]?.oid === branch.oid ? `Merged #${merged[branch.name]!.number}` : undefined;
  if (section === "branches") return refs.branches.map(branch => row(branch.ref, "arrow.triangle.branch", branch.name, { current: branch.current, detail: mergedDetail(branch) }));
  if (section === "tags") return refs.tags.map(tag => row(tag.ref, "tag", tag.name));
  return refs.remotes.filter(remote => remote.branches.length).flatMap(remote => [
    <SidebarItem key={`remote:${remote.name}`} id={`remote:${remote.name}`} selectable={false}><SidebarRow symbol="network" label={remote.name} /></SidebarItem>,
    ...remote.branches.map(branch => row(branch.ref, "arrow.triangle.branch", branch.branch, { indent: true })),
  ]);
}

/** Stashes, newest first, with how long ago each was made. */
function stashSidebarItems(stashes: GitStash[] | null, onContextMenu: (event: { oid: string; position: { x: number; y: number } }) => void) {
  return (stashes ?? []).map(stash => <SidebarItem key={stash.oid} id={`stash:${stash.oid}`} onContextMenu={event => onContextMenu({ oid: stash.oid, position: event.windowPosition })}>
      <SidebarRow symbol="archivebox" label={stashLabel(stash.message)} detail={stash.time ? sidebarDate(stash.time) : undefined} />
    </SidebarItem>);
}

/** Worktrees (none when there is only the main one); this window's worktree has a checkmark. */
function worktreeSidebarItems(worktrees: WorktreeEntry[] | null, root: string | null, onContextMenu: (event: { path: string; position: { x: number; y: number } }) => void) {
  if (!worktrees || worktrees.length < 2) return [];
  return worktrees.map(worktree => <SidebarItem key={`worktree:${worktree.path}`} id={`worktree:${worktree.path}`} onContextMenu={event => onContextMenu({ path: worktree.path, position: event.windowPosition })}>
      <SidebarRow symbol="folder" label={worktreeName(worktree.path)} detail={worktreeDetail(worktree)} current={worktree.path === root} />
    </SidebarItem>);
}

/** A note on what the queue is, then one row per entry; none when nothing is pending. */
function queueSidebarItems(queue: readonly QueueEntry[], onContextMenu: (event: { entry: QueueEntry; position: { x: number; y: number } }) => void) {
  if (!queue.length) return [];
  return [
    <SidebarItem key="review-note" id="review-note" selectable={false} rowHeight={32}><Text style={styles.queueNote} numberOfLines={2}>{queueNote}</Text></SidebarItem>,
    ...queue.map(entry => <SidebarItem key={`review:${entry.id}`} id={`review:${entry.id}`} onContextMenu={event => onContextMenu({ entry, position: event.windowPosition })}>
      <SidebarRow symbol={entry.kind === "worktree" ? "folder" : "arrow.triangle.branch"} label={entry.name} detail={queueDetail(entry)} />
    </SidebarItem>),
  ];
}

/** Pull Requests (for a repository on github.com): open PRs, or Sign In to GitHub… when signed out. */
function pullRequestSidebarItems(state: PullRequestsState, status: "loading" | "signed-out" | "signed-in", onContextMenu: (event: { number: number; position: { x: number; y: number } }) => void) {
  if (!state.repo || status === "loading") return [];
  const note = (text: string) => <SidebarItem key="pulls:note" id="pulls:note" selectable={false}><Text style={styles.sidebarNote}>{text}</Text></SidebarItem>;
  return [
    ...status === "signed-out" ? [<SidebarItem key="github-sign-in" id="github-sign-in"><SidebarRow symbol="person.crop.circle" label="Sign In to GitHub…" /></SidebarItem>]
      : state.pulls?.length ? state.pulls.map(pull => <SidebarItem key={`pr:${pull.number}`} id={`pr:${pull.number}`} rowHeight={40} onContextMenu={event => onContextMenu({ number: pull.number, position: event.windowPosition })}><PullRequestRow pull={pull} /></SidebarItem>)
      : [note(state.pulls ? "No open pull requests" : state.error && !state.loading ? "Couldn’t load pull requests" : "Loading…")],
  ];
}

/** "#12 Title" over the author (plain secondary text; a draft says so after the author). */
function PullRequestRow({ pull }: { pull: GitHubPullRequest }) {
  const color = useSymbolColor("blue");
  const secondary = useSymbolColor("secondary");
  const detail = pull.draft ? `${pull.author} · Draft` : pull.author;
  return <View style={styles.pullRow} accessible accessibilityLabel={`Pull request ${pull.number}, ${pull.title}, by ${detail}`}>
    <View style={styles.sidebarIcon}><SFSymbol name="arrow.triangle.pull" color={color} size={15} /></View>
    <View style={styles.headingStack}>
      <Text style={styles.pullRowTitle} numberOfLines={1}><Text style={{ color: secondary }}>{`#${pull.number} `}</Text>{pull.title}</Text>
      <Text style={[styles.pullAuthor, { color: secondary }]} numberOfLines={1}>{detail}</Text>
    </View>
  </View>;
}

const pullState = (pull: GitHubPullRequest) => pull.merged ? "Merged" : pull.state === "closed" ? "Closed" : pull.draft ? "Draft" : "Open";

/** The selected pull request's header (title, number, author, base ← head, state, where each reviewer stands, Review…) over its changed files. */
function PullRequestFiles({ pull, state, filter, onSelect, review }: { pull: GitHubPullRequest; state: PullRequestsState; filter: string; onSelect: (path: string) => void; review: ReactNode }) {
  const reviewers = state.number === pull.number && state.reviews ? reviewSummary(state.reviews).map(entry => entry.text).join(" · ") : "";
  const comments = commentCounts(state.number === pull.number ? state.threads : null);
  const files = useMemo(() => state.number === pull.number ? state.files?.filter(file => !filter || file.path === state.selectedPath || pathParts(file.path).name.toLowerCase().includes(filter.toLowerCase())) ?? [] : [], [state.number, state.files, state.selectedPath, pull.number, filter]);
  const list = useFileList(files, "fileList");
  return <View style={styles.listSection}>
    <View style={styles.pullHeader}>
      <Text style={styles.pullTitle} accessibilityRole="header" selectable numberOfLines={3}>{pull.title}</Text>
      <Text style={styles.headingNote} selectable numberOfLines={2}>{`#${pull.number} · ${pull.author} · ${pull.base} ← ${pull.head} · ${pullState(pull)}`}</Text>
      <View style={styles.pullReview}>
        <Text style={[styles.headingNote, styles.root]} selectable numberOfLines={2} accessibilityLabel={reviewers ? `Reviews: ${reviewers}` : "No reviews"}>{reviewers || "No reviews yet"}</Text>
        {review}
      </View>
    </View>
    {files.length ? <Sidebar key={list.rowHeight} style={[styles.root, styles.separated]} selectedId={files.some(file => file.path === state.selectedPath) ? state.selectedPath : null} onSelectionChange={event => { if (event.id && !event.id.startsWith("folder:")) onSelect(event.id); }} defaultRowHeight={list.rowHeight}>
      {list.rows.map(row => {
        if (row.type === "folder") return folderItem(row, list.rowHeight);
        const file = row.entry;
        const { name, folder } = pathParts(file.path);
        const count = comments.get(file.path) ?? 0;
        const commentsLabel = count === 1 ? "1 comment" : `${count} comments`;
        return <SidebarItem key={file.path} id={file.path}>
          <View style={[styles.fileRow, { height: list.rowHeight }, row.indent && styles.fileIndent]} accessible accessibilityLabel={`${name}${folder ? `, ${folder}` : ""}, ${file.additions} added, ${file.deletions} removed${count ? `, ${commentsLabel}` : ""}`}>
            <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
            <Text style={styles.fileFolder} numberOfLines={1} ellipsizeMode="head">{list.showFolder ? folder : ""}</Text>
            {count ? <Text style={styles.count}>{commentsLabel}</Text> : null}
            <Text style={styles.count}>{`+${file.additions} −${file.deletions}`}</Text>
          </View>
        </SidebarItem>;
      })}
    </Sidebar> : <View style={[styles.emptyList, styles.separated]}><Text style={styles.emptyListText}>{state.filesLoading ? "Loading…" : state.filesError ? "Couldn’t read the files" : filter ? "No matching files" : "No files"}</Text></View>}
  </View>;
}

/** The selected worktree's changed files, read-only, with Open in New Window; selecting a file shows its diff. */
function WorktreeFiles({ worktree, title = worktree.path, preview, filter, accessory, onSelect }: { worktree: { path: string }; title?: string; preview: WorktreePreviewState; filter: string; accessory: ReactNode; onSelect: (path: string) => void }) {
  const files = preview.path === worktree.path ? preview.files.filter(file => !filter || file.path === preview.selectedPath || pathParts(file.path).name.toLowerCase().includes(filter.toLowerCase())) : [];
  const list = useFileList(files, "fileList", entry => fileStatus(entry, entry.worktreeStatus === ".").label);
  return <View style={styles.listSection}>
    <View style={styles.heading}>
      <Text style={styles.headingLabel} accessibilityRole="header" numberOfLines={1} ellipsizeMode="head">{title}</Text>
      {accessory}
    </View>
    {files.length ? <Sidebar key={list.rowHeight} style={styles.root} selectedId={files.some(file => file.path === preview.selectedPath) ? preview.selectedPath : null} onSelectionChange={event => { if (event.id && !event.id.startsWith("folder:")) onSelect(event.id); }} defaultRowHeight={list.rowHeight}>
      {list.rows.map(row => row.type === "folder" ? folderItem(row, list.rowHeight)
        : <SidebarItem key={row.id} id={row.id}><FileRow entry={row.entry} staged={row.entry.worktreeStatus === "."} showFolder={list.showFolder} indent={row.indent} height={list.rowHeight} /></SidebarItem>)}
    </Sidebar> : <View style={styles.emptyList}><Text style={styles.emptyListText}>{preview.loading ? "Loading…" : preview.error ? "Couldn’t read the worktree" : filter ? "No matching files" : "No changes"}</Text></View>}
  </View>;
}

/** The selected stash's message and files; selecting a file shows its diff. */
function StashFiles({ stash, preview, filter, onSelect }: { stash: GitStash; preview: StashPreviewState; filter: string; onSelect: (path: string) => void }) {
  const files = preview.oid === stash.oid ? preview.files.filter(file => !filter || file.path === preview.selectedPath || pathParts(file.path).name.toLowerCase().includes(filter.toLowerCase())) : [];
  const list = useFileList(files, "fileList");
  return <View style={styles.listSection}>
    <View style={styles.heading}>
      <Text style={styles.headingLabel} accessibilityRole="header" numberOfLines={1}>{stash.message}</Text>
    </View>
    {files.length ? <Sidebar key={list.rowHeight} style={styles.root} selectedId={preview.selectedPath} onSelectionChange={event => { if (event.id && !event.id.startsWith("folder:")) onSelect(event.id); }} defaultRowHeight={list.rowHeight}>
      {list.rows.map(row => {
        if (row.type === "folder") return folderItem(row, list.rowHeight);
        const { name, folder } = pathParts(row.id);
        return <SidebarItem key={row.id} id={row.id}>
          <View style={[styles.fileRow, { height: list.rowHeight }, row.indent && styles.fileIndent]} accessible accessibilityLabel={folder ? `${name}, ${folder}` : name}>
            <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
            {folder && list.showFolder ? <Text style={styles.fileFolder} numberOfLines={1} ellipsizeMode="head">{folder}</Text> : null}
          </View>
        </SidebarItem>;
      })}
    </Sidebar> : <View style={styles.emptyList}><Text style={styles.emptyListText}>{preview.loading ? "Loading…" : filter ? "No matching files" : "No files"}</Text></View>}
  </View>;
}

/** Names the remote a branch's first push goes to; Publish is the default (nothing is lost). */
async function confirmPublish(windowId: string, branch: string, remote: string) {
  try {
    const result = await showMessage({
      windowId, kind: "info", title: `Publish “${branch}” to “${remote}”?`,
      message: `Legend Git pushes the branch to “${remote}” and sets “${remote}/${branch}” as its upstream, so Pull and Push use it from then on.`,
      buttons: [{ id: "publish", label: "Publish" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "publish", cancelButtonId: "cancel",
    });
    return result.buttonId === "publish";
  } catch (error) { console.error(error); return false; }
}

/** Offers to stash the changes Git refused to carry along, then switch. */
async function confirmStashAndSwitch(windowId: string, branch: string, gitMessage: string) {
  const files = gitMessage.split("\n").filter(line => line.startsWith("\t")).length;
  try {
    const result = await showMessage({
      windowId, kind: "warning",
      title: files ? `You have uncommitted changes in ${files === 1 ? "1 file" : `${files} files`} that switching to “${branch}” would overwrite.` : `Switching to “${branch}” would overwrite your uncommitted changes.`,
      message: `Stash and Switch saves all your changes, untracked files included, as the stash “auto-stash before switching to ${branch}”. Apply or pop it from Stashes later.`,
      buttons: [{ id: "stash", label: "Stash and Switch" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "stash", cancelButtonId: "cancel",
    });
    return result.buttonId === "stash";
  } catch (error) { console.error(error); return false; }
}

/** The Rebase sheet: both branches, the commits Git replays (rewriting them), and a warning when they were pushed. */
async function confirmRebase(windowId: string, branch: string, onto: string, plan: { commits: number; pushed: boolean }) {
  const commits = plan.commits === 1 ? "1 commit" : `${plan.commits} commits`;
  const message = !plan.commits
    ? `“${branch}” has no commits of its own since it branched off, so Git fast-forwards it to “${onto}”.`
    : `Git replays ${commits} of “${branch}” on top of “${onto}”, rewriting ${plan.commits === 1 ? "it as a new commit" : "them as new commits"}. If a commit conflicts, the rebase stops there so you can resolve it, then continue or abort it.`
      + (plan.pushed ? `\n\nSome of these commits are already pushed to the upstream branch. After the rebase, pushing “${branch}” needs a force push, which rewrites it for everyone.` : "");
  try {
    const result = await showMessage({ windowId, kind: plan.pushed ? "warning" : "info", title: `Rebase “${branch}” onto “${onto}”?`, message, buttons: [{ id: "rebase", label: "Rebase" }, { id: "cancel", label: "Cancel" }], defaultButtonId: plan.pushed ? "cancel" : "rebase", cancelButtonId: "cancel" });
    return result.buttonId === "rebase";
  } catch (error) { console.error(error); return false; }
}

/** The Revert sheet: Git adds a commit undoing `name` on `branch`. */
async function confirmRevert(windowId: string, name: string, short: string, branch: string) {
  try {
    const result = await showMessage({ windowId, kind: "info", title: `Revert ${name}?`, message: `Git adds a commit on “${branch}” that undoes the changes of ${short}. If they clash with later changes, the revert stops so you can resolve the conflicts, then continue or abort it.`,
      buttons: [{ id: "revert", label: "Revert" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "revert", cancelButtonId: "cancel" });
    return result.buttonId === "revert";
  } catch (error) { console.error(error); return false; }
}

/** The Merge sheet: both branches, and whether Git fast-forwards or makes a merge commit. */
async function confirmMerge(windowId: string, name: string, into: string, kind: "fast-forward" | "merge") {
  const message = kind === "fast-forward"
    ? `“${into}” has no commits of its own since “${name}” branched off, so Git fast-forwards “${into}” to “${name}”. No merge commit is made.`
    : `Git makes a merge commit on “${into}” with its default message. If both branches changed the same lines, the merge stops so you can resolve the conflicts, then continue or abort it.`;
  try {
    const result = await showMessage({ windowId, kind: "info", title: `Merge “${name}” into “${into}”?`, message, buttons: [{ id: "merge", label: "Merge" }, { id: "cancel", label: "Cancel" }], defaultButtonId: "merge", cancelButtonId: "cancel" });
    return result.buttonId === "merge";
  } catch (error) { console.error(error); return false; }
}

/**
 * A native warning sheet on the main window; resolves true when the user picks the action. With `safeDefault`,
 * Return picks Cancel (for actions that can lose work without a backup).
 */
async function confirmDestructive(windowId: string, title: string, action: string, message = "Legend Git saves a backup first. Use Changes ▸ Restore Last Discard to bring the changes back.", safeDefault = false) {
  try {
    const result = await showMessage({ windowId, kind: "warning", title, message, buttons: [{ id: "confirm", label: action }, { id: "cancel", label: "Cancel" }], defaultButtonId: safeDefault ? "cancel" : "confirm", cancelButtonId: "cancel" });
    return result.buttonId === "confirm";
  } catch (error) { console.error(error); return false; }
}

function ChangesList({ title, entries, filtered, selectedPath, onSelect, onContextMenu, action, disabled, onAction, secondaryAction, secondaryDisabled, onSecondaryAction }: {
  title: string; entries: GitStatusEntry[]; filtered: boolean; selectedPath: string | null; onSelect: (path: string | null) => void;
  onContextMenu: (path: string, position: { x: number; y: number }) => void;
  action: string; disabled: boolean; onAction: (path: string) => void;
  secondaryAction?: string; secondaryDisabled?: boolean; onSecondaryAction?: () => void;
}) {
  const staged = title === "Staged";
  const list = useFileList(entries, staged ? "staged" : "unstaged", entry => fileStatus(entry, staged).label);
  return <View style={styles.listSection}>
    <View style={styles.heading}>
      <Text style={styles.headingLabel} accessibilityRole="header">{title} ({entries.length})</Text>
      {secondaryAction ? <Button style={styles.discard} disabled={secondaryDisabled} onPress={() => onSecondaryAction?.()}>{secondaryAction}</Button> : null}
      <Button style={styles.action} disabled={disabled || selectedPath === null} onPress={() => { if (selectedPath !== null) onAction(selectedPath); }}>{action}</Button>
    </View>
    {entries.length ? <Sidebar key={list.rowHeight} style={styles.root} accessibilityLabel={`${title} files`} selectedId={selectedPath} onSelectionChange={event => onSelect(event.id)} defaultRowHeight={list.rowHeight}>
      {list.rows.map(row => row.type === "folder" ? folderItem(row, list.rowHeight)
        : <SidebarItem key={row.id} id={row.id} onContextMenu={event => onContextMenu(row.id, event.windowPosition)}><FileRow entry={row.entry} staged={staged} showFolder={list.showFolder} indent={row.indent} height={list.rowHeight} /></SidebarItem>)}
    </Sidebar> : <View style={styles.emptyList}><Text style={styles.emptyListText}>{filtered ? "No matching files" : `No ${title.toLowerCase()} changes`}</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingTop: contentInset, backgroundColor: PlatformColor("windowBackgroundColor") },
  detail: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor") },
  hidden: { display: "none" },
  panel: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", minHeight: 0, backgroundColor: PlatformColor("controlBackgroundColor") },
  open: { width: 150, height: 28 },
  listSection: { flex: 1 },
  separated: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingLeft: 16, paddingRight: 12 },
  headingLabel: { flex: 1, fontSize: 11, fontWeight: "600", color: PlatformColor("secondaryLabelColor") },
  headingNote: { marginTop: 2, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  tallHeading: { height: 48 },
  queueOpen: { width: 110, height: 24 },
  headingStack: { flex: 1, justifyContent: "center" },
  fixed: { flex: 0 },
  queueBar: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  action: { width: 72, height: 24 },
  openPull: { width: 120, height: 24 },
  stashButtons: { flexDirection: "row", gap: 8 },
  openWindow: { width: 150, height: 24 },
  // A Sidebar row's content is laid out from the top of the native cell: rows take the row height to center.
  fileRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 },
  fileIndent: { paddingLeft: 22 },
  fileName: { flexShrink: 0, maxWidth: "70%", fontSize: 13, color: PlatformColor("labelColor") },
  fileFolder: { flex: 1, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  discard: { width: 80, height: 24 },
  emptyList: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 24 },
  emptyListText: { fontSize: 12, color: PlatformColor("tertiaryLabelColor") },
  section: { paddingHorizontal: 10, paddingTop: 6, fontSize: 11, fontWeight: "700", color: PlatformColor("tertiaryLabelColor") },
  sectionHeader: { height: 28, flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 10, paddingBottom: 5 },
  sectionTitle: { flex: 1, fontSize: 11, fontWeight: "700" },
  sectionCount: { fontSize: 11, fontVariant: ["tabular-nums"] },
  window: { flex: 1, backgroundColor: PlatformColor("windowBackgroundColor") },
  // Past the header on every side: AppKit takes a borderless button's clicks only inside its inset bezel rect.
  sectionToggle: { position: "absolute", left: -12, right: -12, top: -4, bottom: -4, width: undefined, height: undefined, opacity: 0 },
  queueNote: { paddingHorizontal: 10, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  sidebarRow: { height: 28, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  indented: { paddingLeft: 24 },
  sidebarIcon: { width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  label: { flex: 1, fontSize: 13, color: PlatformColor("labelColor") },
  addComment: { width: 120, height: 24 },
  markResolved: { width: 110, height: 24 },
  unplaced: { paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  count: { fontSize: 12, color: PlatformColor("secondaryLabelColor"), fontVariant: ["tabular-nums"] },
  sidebarNote: { paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
  barButton: { width: 84, height: 24 },
  pullRow: { height: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  pullRowTitle: { fontSize: 13, color: PlatformColor("labelColor") },
  pullAuthor: { fontSize: 11, marginTop: 1 },
  pullReview: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  pullHeader: { paddingLeft: 16, paddingRight: 12, paddingTop: 10, paddingBottom: 10, gap: 2 },
  pullTitle: { fontSize: 13, fontWeight: "600", color: PlatformColor("labelColor") },
});

export default App;
