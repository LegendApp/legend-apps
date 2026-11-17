import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { GitBranchNotMergedError, GitLocalChangesError, GitPullDivergedError, GitPushRejectedError, GitServiceError, GitStashDropError, type GitRefList, type GitStash, type GitStatusEntry } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { conflictedEntries, createGitChanges, emptyChanges, stagedEntries, unstagedEntries } from "./gitChanges";
import { DiffPane, type DiffLineTarget } from "./DiffPane";
import { CommitDetails, HistoryList, type BlameTarget, type HistoryActions } from "./HistoryView";
import { commandEnabled, commandLabel, commandMenuItem, queueEntry, runCommand, sectionPullRequest, sectionRef, sectionReview, sectionShowsHistory, sectionStash, sectionWorktree, type CommandContext, type CommandId, type Section } from "./commands";
import { queueDetail, queuePushTarget, reviewQueue, type QueueEntry } from "./gitQueue";
import { createGitRefs, emptyRefs, findRef, recentBranches, resolveBranchName, type WorktreeEntry } from "./gitRefs";
import { createWorktreePreview, emptyWorktreePreview, worktreeDetail, worktreeName, type WorktreePreviewState } from "./gitWorktrees";
import { closeMenuWindow, mainWindowId, registerMenuRunner, runMenuAction, useMenuBar, openWorktreePaths, openWorktreeWindow, publishMenu, setMenuWindow, type GitWindowProps } from "./gitWindows";
import { runCommand as runProcess } from "@legendapp/spark/processes";
import { commitGitHubUrl, createGitHistory, emptyHistory, searchScopes, type SearchScope } from "./gitHistory";
import { createGitNetwork, emptyNetwork, networkStatusText, networkVerb, type NetworkOperation } from "./gitNetwork";
import { createStashPreview, emptyStashPreview, sidebarDate, stashLabel, type StashPreviewState } from "./gitStashes";
import { setStringAsync } from "@legendapp/spark/clipboard";
import { showContextMenu } from "@legendapp/spark/context-menu";
import { openURL } from "@legendapp/spark/links";
import { subscribeToOpenRequests } from "@legendapp/spark/app/documents";
import { EmptyState } from "./EmptyState";
import { gitHubAccount, gitHubCliToken, useGitHubAccount } from "./gitHubAccount";
import { createPullRequests, emptyPullRequests, type PullRequestsState } from "./gitPullRequests";
import type { GitHubPullRequest } from "./github";
import { StateBar } from "./StateBar";
import { abortLabel, abortWarning, canContinue, operationText } from "./gitOperation";
import { recentLabels, recentRepositories, useRecentRepositories } from "./gitRecents";
import { FileRow, pathParts, useSymbolColor } from "./FileRow";
import { CommitComposer, type CommitMessageGenerator } from "./CommitComposer";
import { openFileDialog, showMessage, showPrompt } from "@legendapp/spark/dialogs";
import { useMenu, type UseMenuOptions } from "@legendapp/spark/menus";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { addWindowListener, setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener, setToolbarItemText, type MacOSToolbarItem } from "@legendapp/spark/windows/macos";

const contentInset = 52;

/** The main window, or (with `initialPath`) a window opened for one worktree, titled `<repoName> — <branch>`. */
export function App({ windowId = mainWindowId, initialPath, repoName }: GitWindowProps = {}) {
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
  const [stashPreview, setStashPreview] = useState(emptyStashPreview);
  const stashController = useRef<ReturnType<typeof createStashPreview> | null>(null);
  const [worktreePreview, setWorktreePreview] = useState(emptyWorktreePreview);
  const worktreeController = useRef<ReturnType<typeof createWorktreePreview> | null>(null);
  const [network, setNetwork] = useState(emptyNetwork);
  const networkController = useRef<ReturnType<typeof createGitNetwork> | null>(null);
  const [pulls, setPulls] = useState(emptyPullRequests);
  const pullsController = useRef<ReturnType<typeof createPullRequests> | null>(null);
  const gitHub = useGitHubAccount();
  const signingIn = useRef(false);
  const root = changes.root;
  const recents = useRecentRepositories();
  const operation = root ? changes.operation : null;
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
      const result = await openFileDialog({ windowId, selection: "directories", multiple: false, title: "Open Repository" });
      if (!result.canceled && controller.current === owner) await owner?.open(result.paths[0]!);
    } catch (error) { console.error(error); }
  }

  /** Opens a recent repository in this window; a folder that's gone or no longer a repository gets the Not a Repository sheet. */
  function openRecent(path: string) { void controller.current?.open(path); }

  async function abortOperation() {
    const current = operation, owner = controller.current;
    if (!current || !owner) return;
    const { title, message } = abortWarning(current);
    if (await confirmDestructive(windowId, title, abortLabel(current.kind), message, true)) await owner.abortOperation(current.kind);
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
    const entry = findRef(refsRef.current.refs, ref), owner = refsController.current;
    if (!entry || entry.kind === "tag" || !owner) return;
    // A selected remote branch gives way to the local branch made from it.
    const switched = (local: string) => { if (entry.kind === "remote") setSection(current => current === `ref:${ref}` ? `ref:${local}` : current); };
    try {
      switched(await owner.checkout(entry));
    } catch (error) {
      if (!(error instanceof GitLocalChangesError)) { await reportBranchError(`Couldn’t Switch to “${entry.ref.name}”`, error); return; }
      if (!await confirmStashAndSwitch(windowId, error.branch, error.message)) return;
      try { switched(await owner.stashAndCheckout(entry)); } catch (failed) { await reportBranchError(`Couldn’t Switch to “${entry.ref.name}”`, failed); }
    }
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

  /** Asks first; when Git refuses because the branch is not fully merged, asks again before `git branch -D`. */
  async function deleteBranch(ref: string) {
    const entry = findRef(refsRef.current.refs, ref), owner = refsController.current;
    if (entry?.kind !== "branch" || !owner) return;
    const name = entry.ref.name;
    if (!await confirmDestructive(windowId, `Delete the branch “${name}”?`, "Delete", "Its commits stay in the repository only while another branch or tag contains them.")) return;
    try {
      await owner.delete(name);
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
    if (!owner) return;
    const branch = changes.status?.branch;
    try {
      await start(owner);
    } catch (error) {
      if (error instanceof GitServiceError && error.code === "aborted") return;
      const text = (error instanceof Error ? error.message : String(error)).replace(/^hint:.*(?:\n|$)/gm, "").trim();
      if (error instanceof GitPushRejectedError) await reportBranchError(`“${(upstream === undefined ? branch?.upstream : upstream) ?? "The remote"}” Has Commits You Don’t Have`, `Pull first, then push again.\n\n${text}`);
      else if (error instanceof GitPullDivergedError) {
        await reportBranchError("Couldn’t Pull", `${text}\n\n“${branch?.head}” and “${branch?.upstream}” both have new commits. Legend Git pulls only by fast-forward for now; merge or rebase the branch in Terminal.`);
      } else await reportBranchError({ fetch: "Couldn’t Fetch", pull: "Couldn’t Pull", push: "Couldn’t Push", publish: "Couldn’t Publish the Branch" }[operation], text);
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
    canCommit: !!root && section === "changes" && !busy
      || !!queueWorktree && worktreePreview.path === queueWorktree.path && !worktreePreview.writing && worktreePreview.files.some(file => file.kind !== "untracked" && file.indexStatus !== "."),
    refs: root ? refs.refs : null,
    unborn: !root || changes.status?.branch.oid === "(initial)",
    branchBusy: refs.writing,
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
    gitHub,
    run: {
      openRepository: () => void chooseRepository(),
      openRecent,
      abortOperation: () => void abortOperation(),
      continueOperation: () => { if (canContinue(operation)) void controller.current?.continueOperation(operation.kind); },
      toggleSidebar: () => setSidebarCollapsed(value => !value),
      showSection: setSection,
      refresh: () => { void controller.current?.refresh(); void historyController.current?.refresh(); void pullsController.current?.refresh(); },
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
      commit: () => { if (queueWorktree) void commitQueueWorktree(); else commit.current?.(); },
      checkout: ref => void checkout(ref),
      switchBranch: () => void switchBranch(),
      newBranch: start => void newBranch(start),
      renameBranch: ref => void renameBranch(ref),
      deleteBranch: ref => void deleteBranch(ref),
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
      signOutOfGitHub: () => { gitHubAccount.signOut().catch((error: unknown) => reportBranchError("Couldn’t Sign Out of GitHub", error)); },
    },
  };
  const contextRef = useRef(context);
  contextRef.current = context;
  const item = (id: CommandId) => commandMenuItem(id, context);

  const menu: UseMenuOptions = {
    id: "legend-git",
    items: [
      { type: "submenu", id: "app", label: "Legend Git", target: { menu: "app" }, items: [] },
      { type: "submenu", id: "file", label: "File", target: { menu: "file" }, items: [
        // AppKit's own Open Recent (filled from the system's recent documents) sits between these two.
        item("open-repository"), item("open-worktree"),
      ] },
      { type: "submenu", id: "edit", label: "Edit", target: { menu: "edit" }, items: [item("copy-sha"), { type: "separator" }, item("blame-line")] },
      // AppKit's own View ▸ Show/Hide Sidebar drives the split view, so the menu has no second one.
      { type: "submenu", id: "view", label: "View", target: { menu: "view" }, items: [item("show-changes"), item("show-history"), item("show-review"), { type: "separator" }, item("show-file-history"), item("show-all-history")] },
      { type: "submenu", id: "repository", label: "Repository", placement: { before: { menu: "window" } }, items: [item("fetch"), item("pull"), item("push"), item("cancel-network"), { type: "separator" }, item("refresh"), { type: "separator" }, item("open-github"), { type: "separator" }, item("sign-in-github"), item("sign-out-github")] },
      { type: "submenu", id: "branch", label: "Branch", placement: { before: { menu: "window" } }, items: [item("switch-branch"), item("new-branch"), { type: "separator" }, item("rename-branch"), item("delete-branch"), { type: "separator" }, item("abort-operation"), item("continue-operation")] },
      { type: "submenu", id: "worktree", label: "Worktree", placement: { before: { menu: "window" } }, items: [item("new-worktree"), item("open-review-worktree"), { type: "separator" }, item("reveal-worktree"), item("remove-worktree")] },
      {
        type: "submenu", id: "changes", label: "Changes", placement: { before: { menu: "window" } },
        items: [
          item("apply-lines"), { type: "separator" },
          item("discard-file"), item("discard-lines"), item("restore-discard"), { type: "separator" },
          item("stash-changes"), item("stash-all-changes"), item("apply-stash"), item("pop-stash"), item("drop-stash"), { type: "separator" },
          item("generate-message"), item("commit"),
        ],
      },
    ],
    onAction: action => runMenuAction(action.itemId),
  };
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
      const menuContext = contextRef.current;
      // The row keeps the selection, so Compare with Selected can compare the two.
      const items = [
        commandMenuItem("compare-with-selected", menuContext, { target: oid, shortcut: false }), { type: "separator" as const },
        { ...commandMenuItem("new-branch", menuContext, { target: oid, shortcut: false }), label: "New Branch from Commit…" }, { type: "separator" as const },
        ...(["copy-sha", "open-github"] as const).map(id => commandMenuItem(id, menuContext, { target: oid, shortcut: false })),
      ];
      showContextMenu({ windowId, position, items })
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
    showContextMenu({ windowId, position, items: [commandMenuItem("blame-line", { ...contextRef.current, canBlame: true }, { shortcut: false })] })
      .then(result => { if (!result.canceled) runCommand(result.itemId, { ...contextRef.current, canBlame: !!blameTargetRef.current }); }, console.error);
  }

  /** Changes blames added and context lines as on disk (unstaged) or staged, and removed lines one step older. */
  const changesBlameTarget = (target: DiffLineTarget | null): BlameTarget | null => {
    const staged = changes.patch?.section === "staged";
    return target && { ...target, source: target.side === "new" ? staged ? "index" : "workdir" : staged ? "HEAD" : "index" };
  };

  function showFileMenu(path: string, position: { x: number; y: number }) {
    showContextMenu({ windowId, position, items: [commandMenuItem("show-file-history", contextRef.current, { target: path, shortcut: false })] })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, path); }, console.error);
  }

  function showStashMenu({ oid, position }: { oid: string; position: { x: number; y: number } }) {
    const menuContext = contextRef.current;
    const items = [...(["apply-stash", "pop-stash"] as const).map(id => commandMenuItem(id, menuContext, { target: oid, shortcut: false })), { type: "separator" as const }, commandMenuItem("drop-stash", menuContext, { target: oid, shortcut: false })];
    showContextMenu({ windowId, position, items })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, oid); }, console.error);
  }

  function showWorktreeMenu({ path, position }: { path: string; position: { x: number; y: number } }) {
    const menuContext = contextRef.current;
    const items = [
      { ...commandMenuItem("open-worktree", menuContext, { target: path, shortcut: false }), label: "Open in New Window" },
      commandMenuItem("reveal-worktree", menuContext, { target: path, shortcut: false }), { type: "separator" as const },
      { ...commandMenuItem("remove-worktree", menuContext, { target: path, shortcut: false }), label: "Remove…" },
    ];
    showContextMenu({ windowId, position, items })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, path); }, console.error);
  }

  function showQueueMenu({ entry, position }: { entry: QueueEntry; position: { x: number; y: number } }) {
    const menuContext = contextRef.current;
    const push = { ...commandMenuItem("push-review", menuContext, { target: entry.id, shortcut: false }), label: queuePushTarget(entry)?.publish ? "Publish Branch…" : "Push" };
    const items = entry.kind === "worktree" ? [
      { ...commandMenuItem("open-worktree", menuContext, { target: entry.path, shortcut: false }), label: "Open in New Window" }, push,
      { type: "separator" as const }, commandMenuItem("reveal-worktree", menuContext, { target: entry.path, shortcut: false }),
    ] : [push];
    showContextMenu({ windowId, position, items })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, result.itemId === "push-review" ? entry.id : entry.kind === "worktree" ? entry.path : undefined); }, console.error);
  }

  function showRefMenu({ ref, position }: { ref: string; position: { x: number; y: number } }) {
    const menuContext = contextRef.current;
    const entry = findRef(menuContext.refs, ref);
    if (!entry) return;
    const ids: (CommandId | null)[] = entry.kind === "branch" ? ["checkout-ref", "new-branch", null, "rename-branch", "delete-branch", null, "copy-ref-name"]
      : entry.kind === "remote" ? ["checkout-ref", "new-branch", null, "copy-ref-name"] : ["new-branch", null, "copy-ref-name"];
    const items = ids.map(id => id ? { ...commandMenuItem(id, menuContext, { target: ref, shortcut: false }), ...id === "new-branch" ? { label: `New Branch from “${entry.ref.name}”…` } : {} } : { type: "separator" as const });
    showContextMenu({ windowId, position, items })
      .then(result => { if (!result.canceled) runCommand(result.itemId, contextRef.current, ref); }, console.error);
  }

  // A ref deleted or renamed since it was selected has no row; History is shown until the effect above moves there.
  const sidebarSection = sectionRef(section) && !findRef(refs.refs, sectionRef(section)) ? "history"
    : selectedStash && !refs.stashes?.some(entry => entry.oid === selectedStash) ? "changes"
    : selectedWorktree && !worktreeEntry ? "changes"
    : sectionReview(section) && !selectedQueue ? "changes"
    : selectedPullNumber !== null && !selectedPull ? "changes" : section;
  const branch = changes.status?.branch;
  const branchLabel = !branch?.head ? null : branch.head === "(detached)" ? `${branch.oid?.slice(0, 7) ?? "HEAD"} (detached)` : branch.head;
  const button = (id: CommandId, symbol: string) => {
    const label = commandLabel(id, context);
    return { type: "button" as const, id, label, symbol, tooltip: label, disabled: !commandEnabled(id, context) };
  };
  const networkText = networkStatusText(network, root ? branch : null);
  const aheadBehindTooltip = `${branch?.behind ?? 0} incoming and ${branch?.ahead ?? 0} outgoing commits on “${branch?.upstream}”`;
  const toolbarItems: MacOSToolbarItem[] = [
    { ...button("toggle-sidebar", "sidebar.left"), placement: "leading" },
    ...root ? [
      { type: "menu", id: "branch", label: branchLabel ?? "Branch", symbol: "arrow.triangle.branch", placement: "leading", tooltip: "Current branch", items: [
        ...recentBranches(context.refs).map(branch => ({ type: "checkbox" as const, id: `checkout:${branch.ref}`, label: branch.name, checked: branch.current, disabled: branch.current || !commandEnabled("checkout-ref", context, branch.ref) && !branch.current })),
        ...context.refs?.branches.length ? [{ type: "separator" as const }] : [],
        commandMenuItem("switch-branch", context, { shortcut: false }),
        commandMenuItem("new-branch", context, { shortcut: false }),
      ] },
      { type: "segmented", id: "section", label: "View", value: section === "changes" || section === "history" ? section : null, segments: [
        { value: "changes", label: "Changes", symbol: "square.and.pencil" },
        { value: "history", label: "History", symbol: "clock" },
      ] },
      // Fetch, Pull and Push stay in the Repository menu: the pinned Spark's `disabled` toolbar button still acts enabled
      // (fixed in Spark main, not released). Its status label shows the running operation's progress, or ↓behind ↑ahead.
      ...network.operation ? [{ type: "label" as const, id: "network-progress", label: `${networkVerb(network.operation)}…`, text: `${networkVerb(network.operation)}…`, width: 180 }]
        : networkText ? [{ type: "label" as const, id: "ahead-behind", label: `${aheadBehindTooltip}`, text: networkText }] : [],
      button("refresh", "arrow.clockwise"),
      // AppKit's NSSearchToolbarItem (it collapses itself when the toolbar is narrow); Spark's `collapses` button ignores real clicks (Spark ask).
      { type: "search", id: "search", label: "Search", placeholder: showsHistory ? "Search Commits" : "Filter Files", width: 200 },
      ...showsHistory ? [{
        type: "menu" as const, id: "search-scope", label: searchScopes.find(entry => entry.scope === searchScope)!.label, tooltip: "Search in",
        items: searchScopes.map(({ scope, label }) => ({ type: "checkbox" as const, id: `search-${scope}`, label, checked: scope === searchScope })),
      }] : [],
    ] satisfies MacOSToolbarItem[] : [],
  ];
  // The search field keeps its own text; it is passed only when the toolbar is rebuilt (a section switch or Show All).
  const searchText = showsHistory ? historyQuery : filter;
  // Progress text changes go to the label alone (below); a rebuilt toolbar carries the current text.
  const toolbar = { visible: true, style: "unified" as const, items: toolbarItems.map(entry => entry.type === "search" ? { ...entry, value: searchText } : entry.id === "network-progress" ? { ...entry, text: networkText } : entry) };
  const toolbarRef = useRef(toolbar);
  toolbarRef.current = toolbar;
  // Title bar options go once: re-sending them grows the window by 20 pt each time (Spark ask).
  useEffect(() => {
    void setWindowOptions(windowId, { appearance: "system", macos: { titleBar: { contentLayout: "fullSize", transparent: true, titleVisibility: "visible" } } }).catch(console.error);
  }, []);
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
  // Item changes (section, labels, availability) update only the toolbar.
  const toolbarKey = JSON.stringify([toolbarItems, searchEpoch]);
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
          historyOwner.search(contextRef.current.searchScope, event.value);
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
    registerMenuRunner(windowId, itemId => { if (!disposed) runCommand(itemId, contextRef.current); });
    const closeRegistration = addWindowListener(windowId, "closed", close);
    // Pull requests re-read when the window comes to the front (and on ⌘R), never on a timer.
    const focusRegistration = addWindowListener(windowId, "focusChanged", event => {
      if (disposed || !event.focused) return;
      setMenuWindow(windowId);
      void pullsOwner.refresh();
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
      confirmReplace={() => confirmDestructive(windowId, "Replace the commit message?", "Replace", "The generated message replaces the summary and description you wrote.")}
      generatorRef={generator} onGeneratingChange={setGenerating} />
  </View>;

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

  const pullFile = selectedPull && pulls.number === selectedPull.number ? pulls.files?.find(file => file.path === pulls.selectedPath) : undefined;
  const pullDetail = pullFile?.text
    ? <DiffPane readOnly disabled patch={{ path: pullFile.path, text: pullFile.text, file: pullFile.file, section: "unstaged", conflicted: false }} onApply={() => {}} />
    : <EmptyState title={pulls.filesLoading && !pulls.files ? "Loading Pull Request…" : pulls.filesError ? "Couldn’t Read the Pull Request" : pullFile?.error ? "Couldn’t Show the Diff" : pullFile ? "No Diff to Show" : pulls.files?.length === 0 ? "No Changes" : "No Selection"}
      message={pulls.filesError ?? pullFile?.error ?? (pullFile ? "GitHub doesn’t show a diff for this file (binary, or too large)." : undefined)} />;

  const changesDetail = changes.patch ? <DiffPane patch={changes.patch} disabled={busy} applyRef={applyLines} discardRef={discardLines}
    onLineChange={target => setBlameTarget(changesBlameTarget(target))}
    onLineContextMenu={(target, position) => { const blame = changesBlameTarget(target); if (blame) showLineMenu(blame, position); }}
    onApply={(keys, text) => void controller.current?.changeLines(keys, text)}
    onDiscard={async (keys, text, what) => { if (await confirmDestructive(windowId, `Discard ${what}?`, "Discard")) await controller.current?.discardLines(keys, text); }} />
    : selected ? <EmptyState title="Loading Diff…" />
    : unstaged.length || staged.length ? <EmptyState title="No Selection" message="Select a file to view its changes." />
    : <EmptyState symbol="checkmark.circle" title="Working Tree Clean" message="There are no changes to commit." />;

  return (<>
    {windowId === mainWindowId ? <GitMenu menu={menu} /> : null}
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
        <Sidebar style={styles.root} selectedId={root ? sidebarSection : null} onSelectionChange={event => {
          if (event.id?.startsWith("recent:")) runCommand("open-recent", contextRef.current, event.id.slice(7));
          else if (event.id === "github-sign-in") runCommand("sign-in-github", contextRef.current);
          else if (event.id === "review") runCommand("show-review", contextRef.current);
          else if (event.id === "changes" || event.id === "history" || event.id?.startsWith("ref:") || event.id?.startsWith("stash:") || event.id?.startsWith("worktree:") || event.id?.startsWith("review:") || event.id?.startsWith("pr:")) setSection(event.id as Section);
        }} contentInsetTop={58}>
          <SidebarItem id="repositories" selectable={false}>
            <Text style={styles.section}>{root?.split("/").pop() ?? (recents.length ? "Recent" : "Repositories")}</Text>
          </SidebarItem>
          {root ? [
            <SidebarItem key="changes" id="changes"><SidebarRow symbol="square.and.pencil" label="Changes" count={changes.status?.entries.length} /></SidebarItem>,
            <SidebarItem key="history" id="history"><SidebarRow symbol="clock" label="History" /></SidebarItem>,
            ...queueSidebarItems(queue, showQueueMenu),
            ...refSidebarItems(refs.refs, ref => showRefMenu(ref)),
            ...stashSidebarItems(refs.stashes, showStashMenu),
            ...worktreeSidebarItems(refs.worktrees, root, showWorktreeMenu),
            ...pullRequestSidebarItems(pulls, gitHub.status),
          ] : recents.length ? recentLabels(recents).map((label, index) => <SidebarItem key={recents[index]} id={`recent:${recents[index]}`}>
            <SidebarRow symbol="folder" label={label} />
          </SidebarItem>) :
            <SidebarItem id="empty" selectable={false}><Text style={styles.sidebarNote}>No repository open</Text></SidebarItem>}
        </Sidebar>
      }
      list={root ? <>
        {changesList}
        {showsHistory ? <View style={styles.listPane}><HistoryList history={history} actions={historyActions} /></View> : null}
        {stashEntry ? <View style={styles.listPane}><StashFiles stash={stashEntry} preview={stashPreview} filter={filter} onSelect={path => stashController.current?.selectFile(path)} /></View> : null}
        {worktreeEntry ? <View style={styles.listPane}><WorktreeFiles worktree={worktreeEntry} preview={worktreePreview} filter={filter} accessory={worktreeOpenButton} onSelect={path => worktreeController.current?.selectFile(path)} /></View> : null}
        {queueWorktree ? <View style={styles.listPane}>
          <WorktreeFiles worktree={queueWorktree} title={queueWorktree.branch ? `${queueWorktree.name} — ${queueWorktree.branch}` : queueWorktree.name} preview={worktreePreview} filter={filter}
            accessory={queueStageButton} onSelect={path => worktreeController.current?.selectFile(path)} />
          <View style={styles.queueBar}>
            {commandEnabled("open-worktree", context, queueWorktree.path) ? <Button style={styles.queueOpen} onPress={() => runCommand("open-worktree", contextRef.current, queueWorktree.path)}>Open Window</Button> : null}
            <View style={styles.root} />
            {queuePushButton}
            <Button style={styles.discard} disabled={!commandEnabled("commit", context)} onPress={() => runCommand("commit", contextRef.current)}>Commit…</Button>
          </View>
        </View> : null}
        {selectedPull ? <View style={styles.listPane}><PullRequestFiles pull={selectedPull} state={pulls} filter={filter} onSelect={path => pullsController.current?.selectFile(path)} /></View> : null}
        {queueBranch ? <View style={styles.listPane}>
          <View style={[styles.heading, styles.tallHeading]}>
            <View style={styles.headingStack}>
              <Text style={[styles.headingLabel, styles.fixed]} accessibilityRole="header" numberOfLines={1}>{queueBranch.name}</Text>
              <Text style={styles.headingNote} numberOfLines={1}>{`${queueBranch.ahead === 1 ? "1 commit" : `${queueBranch.ahead} commits`} not on ${queueBranch.upstream ?? queueBranch.base.replace(/^refs\/(heads|remotes)\//, "")}`}</Text>
            </View>
            {queuePushButton}
          </View>
          <View style={[styles.root, styles.separated]}><HistoryList history={history} actions={historyActions} /></View>
        </View> : null}
      </> : undefined}
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
          {root ? <View style={styles.detail}>{showsHistory || queueBranch ? <CommitDetails history={history} actions={historyActions} /> : stashEntry ? stashDetail : worktreeEntry || queueWorktree ? worktreeDetailPane : selectedPull ? pullDetail : changesDetail}</View>
            : changes.loading ? <EmptyState title="Opening Repository…" />
            : <EmptyState symbol="folder" title="No Repository Open" message="Open a Git repository to see its changes and commit them.">
              <Button style={styles.open} onPress={() => void chooseRepository()}>Open Repository…</Button>
            </EmptyState>}
        </View>
      }
    />
  </>);
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

/** Stashes under a group row, newest first, with how long ago each was made; left out when there are none. */
function stashSidebarItems(stashes: GitStash[] | null, onContextMenu: (event: { oid: string; position: { x: number; y: number } }) => void) {
  if (!stashes?.length) return [];
  return [
    <SidebarItem key="group:stashes" id="group:stashes" selectable={false}><Text style={styles.section} accessibilityRole="header">Stashes</Text></SidebarItem>,
    ...stashes.map(stash => <SidebarItem key={stash.oid} id={`stash:${stash.oid}`} onContextMenu={event => onContextMenu({ oid: stash.oid, position: event.windowPosition })}>
      <SidebarRow symbol="archivebox" label={stashLabel(stash.message)} detail={stash.time ? sidebarDate(stash.time) : undefined} />
    </SidebarItem>),
  ];
}

/** Linked worktrees under a group row (left out when there is only the main one); this window's worktree has a checkmark. */
function worktreeSidebarItems(worktrees: WorktreeEntry[] | null, root: string | null, onContextMenu: (event: { path: string; position: { x: number; y: number } }) => void) {
  if (!worktrees || worktrees.length < 2) return [];
  return [
    <SidebarItem key="group:worktrees" id="group:worktrees" selectable={false}><Text style={styles.section} accessibilityRole="header">Worktrees</Text></SidebarItem>,
    ...worktrees.map(worktree => <SidebarItem key={`worktree:${worktree.path}`} id={`worktree:${worktree.path}`} onContextMenu={event => onContextMenu({ path: worktree.path, position: event.windowPosition })}>
      <SidebarRow symbol="folder" label={worktreeName(worktree.path)} detail={worktreeDetail(worktree)} current={worktree.path === root} />
    </SidebarItem>),
  ];
}

/** The Review Queue row (selecting it selects an entry), then one indented row per entry; left out when nothing is pending. */
function queueSidebarItems(queue: readonly QueueEntry[], onContextMenu: (event: { entry: QueueEntry; position: { x: number; y: number } }) => void) {
  if (!queue.length) return [];
  return [
    <SidebarItem key="review" id="review"><SidebarRow symbol="tray.full" label="Review Queue" count={queue.length} /></SidebarItem>,
    ...queue.map(entry => <SidebarItem key={`review:${entry.id}`} id={`review:${entry.id}`} onContextMenu={event => onContextMenu({ entry, position: event.windowPosition })}>
      <SidebarRow symbol={entry.kind === "worktree" ? "folder" : "arrow.triangle.branch"} label={entry.name} detail={queueDetail(entry)} indent />
    </SidebarItem>),
  ];
}

/** Pull Requests (for a repository on github.com): open PRs, or Sign In to GitHub… when signed out. */
function pullRequestSidebarItems(state: PullRequestsState, status: "loading" | "signed-out" | "signed-in") {
  if (!state.repo || status === "loading") return [];
  const note = (text: string) => <SidebarItem key="pulls:note" id="pulls:note" selectable={false}><Text style={styles.sidebarNote}>{text}</Text></SidebarItem>;
  return [
    <SidebarItem key="group:pulls" id="group:pulls" selectable={false}><Text style={styles.section} accessibilityRole="header">Pull Requests</Text></SidebarItem>,
    ...status === "signed-out" ? [<SidebarItem key="github-sign-in" id="github-sign-in"><SidebarRow symbol="person.crop.circle" label="Sign In to GitHub…" /></SidebarItem>]
      : state.pulls?.length ? state.pulls.map(pull => <SidebarItem key={`pr:${pull.number}`} id={`pr:${pull.number}`} rowHeight={40}><PullRequestRow pull={pull} /></SidebarItem>)
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

/** The selected pull request's header (title, number, author, base ← head, state) over its changed files. */
function PullRequestFiles({ pull, state, filter, onSelect }: { pull: GitHubPullRequest; state: PullRequestsState; filter: string; onSelect: (path: string) => void }) {
  const files = state.number === pull.number ? state.files?.filter(file => !filter || file.path === state.selectedPath || pathParts(file.path).name.toLowerCase().includes(filter.toLowerCase())) ?? [] : [];
  return <View style={styles.listSection}>
    <View style={styles.pullHeader}>
      <Text style={styles.pullTitle} accessibilityRole="header" selectable numberOfLines={3}>{pull.title}</Text>
      <Text style={styles.headingNote} selectable numberOfLines={2}>{`#${pull.number} · ${pull.author} · ${pull.base} ← ${pull.head} · ${pullState(pull)}`}</Text>
    </View>
    {files.length ? <Sidebar style={[styles.root, styles.separated]} selectedId={files.some(file => file.path === state.selectedPath) ? state.selectedPath : null} onSelectionChange={event => { if (event.id) onSelect(event.id); }} defaultRowHeight={24}>
      {files.map(file => {
        const { name, folder } = pathParts(file.path);
        return <SidebarItem key={file.path} id={file.path}>
          <View style={styles.fileRow} accessible accessibilityLabel={`${name}${folder ? `, ${folder}` : ""}, ${file.additions} added, ${file.deletions} removed`}>
            <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
            <Text style={styles.fileFolder} numberOfLines={1} ellipsizeMode="head">{folder}</Text>
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
  return <View style={styles.listSection}>
    <View style={styles.heading}>
      <Text style={styles.headingLabel} accessibilityRole="header" numberOfLines={1} ellipsizeMode="head">{title}</Text>
      {accessory}
    </View>
    {files.length ? <Sidebar style={styles.root} selectedId={files.some(file => file.path === preview.selectedPath) ? preview.selectedPath : null} onSelectionChange={event => { if (event.id) onSelect(event.id); }} defaultRowHeight={24}>
      {files.map(entry => <SidebarItem key={entry.path} id={entry.path}><FileRow entry={entry} staged={entry.worktreeStatus === "."} /></SidebarItem>)}
    </Sidebar> : <View style={styles.emptyList}><Text style={styles.emptyListText}>{preview.loading ? "Loading…" : preview.error ? "Couldn’t read the worktree" : filter ? "No matching files" : "No changes"}</Text></View>}
  </View>;
}

/** The selected stash's message and files; selecting a file shows its diff. */
function StashFiles({ stash, preview, filter, onSelect }: { stash: GitStash; preview: StashPreviewState; filter: string; onSelect: (path: string) => void }) {
  const files = preview.oid === stash.oid ? preview.files.filter(file => !filter || file.path === preview.selectedPath || pathParts(file.path).name.toLowerCase().includes(filter.toLowerCase())) : [];
  return <View style={styles.listSection}>
    <View style={styles.heading}>
      <Text style={styles.headingLabel} accessibilityRole="header" numberOfLines={1}>{stash.message}</Text>
    </View>
    {files.length ? <Sidebar style={styles.root} selectedId={preview.selectedPath} onSelectionChange={event => { if (event.id) onSelect(event.id); }} defaultRowHeight={24}>
      {files.map(file => {
        const { name, folder } = pathParts(file.path);
        return <SidebarItem key={file.path} id={file.path}>
          <View style={styles.fileRow} accessible accessibilityLabel={folder ? `${name}, ${folder}` : name}>
            <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
            {folder ? <Text style={styles.fileFolder} numberOfLines={1} ellipsizeMode="head">{folder}</Text> : null}
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
  headingNote: { marginTop: 2, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  tallHeading: { height: 48 },
  queueOpen: { width: 110, height: 24 },
  headingStack: { flex: 1, justifyContent: "center" },
  fixed: { flex: 0 },
  queueBar: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  action: { width: 72, height: 24 },
  stashButtons: { flexDirection: "row", gap: 8 },
  openWindow: { width: 150, height: 24 },
  fileRow: { height: 24, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 6 },
  fileName: { flexShrink: 0, maxWidth: "70%", fontSize: 13, color: PlatformColor("labelColor") },
  fileFolder: { flex: 1, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
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
  barButton: { width: 84, height: 24 },
  pullRow: { height: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8 },
  pullRowTitle: { fontSize: 13, color: PlatformColor("labelColor") },
  pullAuthor: { fontSize: 11, marginTop: 1 },
  pullHeader: { paddingLeft: 16, paddingRight: 12, paddingTop: 10, paddingBottom: 10, gap: 2 },
  pullTitle: { fontSize: 13, fontWeight: "600", color: PlatformColor("labelColor") },
});

export default App;
