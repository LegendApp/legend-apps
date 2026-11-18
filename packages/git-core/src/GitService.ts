// Plain Node with type stripping loads this module: keep runtime imports to `./gitStatus.ts` and avoid TypeScript-only
// runtime syntax such as parameter properties. The Spark process runner is wired in by `sparkGitService.ts`.
import type { ProcessExit, ProcessOptions, ProcessResult } from "@legendapp/spark/processes";
import { parseGitStatus } from "./gitStatus.ts";
import { parseConflictRegions, resolveConflictRegion, type ConflictRegionSide, type GitConflictRegions } from "./conflictRegions.ts";

export type GitRunner = (options: ProcessOptions) => Promise<ProcessResult>;
export type GitDecoder = (bytes: Uint8Array) => string;
export type GitReadOptions = { signal?: AbortSignal };
/**
 * `index` (default) applies with `git apply --cached`. `worktree` runs `verify`, `git apply --check`, `verify` and
 * `git apply` as one queued operation; once the apply starts it finishes even if `signal` aborts.
 */
export type GitApplyPatchOptions = GitReadOptions & { reverse?: boolean } & (
  | { target?: "index" }
  | { target: "worktree"; verify?: (signal?: AbortSignal) => Promise<void> }
);
export type GitOperationLog = {
  command: string;
  args: readonly string[];
  startedAt: number;
  endedAt: number | null;
  exit: ProcessExit | null;
  stderrTail: string;
};
export type GitRepoState = {
  gitDir: string;
  branch: string | null;
  detachedCommit: string | null;
  detached: boolean;
  merging: boolean;
  rebasing: "apply" | "merge" | null;
  cherryPicking: boolean;
  reverting: boolean;
  bisecting: boolean;
};
/** A merge, rebase, cherry-pick, revert or bisect that Git paused (see GitService.operationState). */
export type GitOperationKind = "merge" | "rebase" | "cherry-pick" | "revert" | "bisect";
/**
 * `branch` is the branch the operation changes (null when detached); `target` names what is merged or rebased onto (a
 * branch, remote branch or tag pointing at it, else an abbreviated commit id); `commit` is the commit picked or reverted;
 * `step` is a rebase's position; `conflicts` counts conflicted paths. Bisect can't continue.
 */
export type GitOperation = {
  kind: GitOperationKind;
  branch: string | null;
  target: string | null;
  commit: { oid: string; subject: string } | null;
  step: { current: number; total: number } | null;
  conflicts: number;
  /** MERGE_HEAD exists, so a commit concludes a merge (also inside a rebase that recreates merges). */
  mergeHead: boolean;
};
/** Which index stage a conflict pick takes: Git's "ours" (stage 2) or "theirs" (stage 3), or both combined. */
export type GitConflictSide = "ours" | "theirs" | "both";
/**
 * A conflicted file: whether ours and theirs have it (a side that deleted it doesn't); `binary` when both have it and they
 * aren't both text files (binary, a link or a submodule), so they can't be combined; `edited` when the worktree file has
 * no conflict markers and matches neither side, i.e. the user resolved it by hand and a pick would replace that.
 */
export type GitConflictFile = { ours: boolean; theirs: boolean; binary: boolean; edited: boolean };
export type GitErrorCode = "aborted" | "index-locked" | "command-failed" | "timed-out" | "output-truncated";
/** One path's worktree state saved by a discard: its mode and blob, or `mode: null` when the path did not exist. */
export type GitBackupEntry = { path: string; mode: "100644" | "100755" | "120000"; oid: string } | { path: string; mode: null; oid?: undefined };
export type GitDiscardBackup = { ref: string; oid: string; entries: GitBackupEntry[] };
/** How `GitService.merge` ended: nothing to merge, a fast-forward, a merge commit, or stopped with the merge in progress. */
export type GitMergeResult = "up-to-date" | "fast-forward" | "merge" | "stopped";
/** How `GitService.rebase` ended: nothing to do, a fast-forward, commits replayed, or stopped with the rebase in progress. */
export type GitRebaseResult = "up-to-date" | "fast-forward" | "rebased" | "stopped";
/**
 * What rebasing the current branch onto a ref does: `commits` it replays (not merges, not ones the ref already has),
 * `behind` the ref's commits it lacks, and whether any replayed commit is already on the branch's upstream (`pushed`).
 */
export type GitRebasePlan = { branch: string; commits: number; behind: number; pushed: boolean };
/** How `GitService.cherryPick` and `revert` ended: a new commit, nothing to commit (the change is there already), or stopped. */
export type GitPickResult = "committed" | "empty" | "stopped";
export type GitCommitInput = { message: string; amend?: boolean; signoff?: boolean };
/** A local branch; `upstream` is the short name of the branch it tracks. */
/** `ahead`/`behind` count commits against the upstream (0 without one); `gone` is set when the upstream ref no longer exists. */
export type GitBranch = { name: string; ref: string; oid: string; current: boolean; upstream: string | null; time: number; ahead: number; behind: number; gone: boolean };
/** A remote-tracking branch: `name` is "origin/feature", `branch` is "feature". */
export type GitRemoteBranch = { name: string; ref: string; oid: string; remote: string; branch: string };
/** A tag; `oid` is the commit it points at (annotated tags are peeled). */
export type GitTag = { name: string; ref: string; oid: string };
/** `defaultBranch` is the full ref name of the branch new work merges into (see parseRefList), or null. */
export type GitRefList = { branches: GitBranch[]; remotes: { name: string; branches: GitRemoteBranch[] }[]; tags: GitTag[]; defaultBranch: string | null };
/** A stash entry: its commit, its current `stash@{n}` index, its reflog subject ("On main: message") and when it was made. */
export type GitStash = { oid: string; index: number; message: string; time: number };
export type GitStashPushOptions = GitReadOptions & { includeUntracked?: boolean };
/**
 * A worktree from `git worktree list --porcelain`: `head` is null for a bare repository or an unborn branch, `branch` is
 * the short name of the checked-out branch (null when detached), `locked`/`prunable` hold Git's reason ("" without one).
 */
export type GitWorktree = { path: string; head: string | null; branch: string | null; detached: boolean; bare: boolean; locked: string | null; prunable: string | null; main: boolean };
/** `branch` checks out an existing local branch; `newBranch` creates one at `startPoint` (HEAD when omitted). */
export type GitAddWorktreeOptions = GitReadOptions & ({ branch: string; newBranch?: undefined; startPoint?: undefined } | { branch?: undefined; newBranch: string; startPoint?: string });
export type GitStagedFile = { path: string; originalPath: string | null; binary: boolean; added: number; deleted: number };
/** The staged changes as `git diff --cached` text; files past the size cap are listed but left out of `patch`. */
export type GitStagedDiff = { files: GitStagedFile[]; patch: string; truncated: boolean; omitted: string[] };
/** An operation Edit ▸ Undo can take back; see GitService.undoPlan. */
export type GitUndoKind = "commit" | "amend" | "merge" | "rebase" | "cherry-pick" | "revert" | "reset" | "checkout" | "branch-delete";
export type GitUndoCommit = { oid: string; subject: string };
/**
 * The newest operation and what undoing it does. `branch` (null when detached) moves from `from` to `to`; a checkout
 * switches back from `from` to `to` (to `toBranch` when that was a branch); a deleted branch `branch` comes back at `to`.
 * `name` is what was merged, rebased onto or picked, when the reflog says. `refusal` says why it can't be undone now.
 */
export type GitUndo = {
  kind: GitUndoKind; branch: string | null; from: GitUndoCommit | null; to: GitUndoCommit; toBranch: string | null; name: string | null;
  /** Commit and amend keep their changes staged; the others move the worktree too. */
  keepsChanges: boolean;
  refusal: string | null;
  /** Identifies the reflog entry, so undo() refuses when a newer operation came in between. */
  entry: string;
};
const deletedBranchesRef = "refs/legend-git/deleted-branches";
// Per path, NUL-separated: the worktree file's blob id (with the repository's filters), "-" when missing, "x" for anything else.
const worktreeBlobs = `for p do
  if test -L "./$p" || test -d "./$p"; then printf 'x\\0'
  elif test -f "./$p"; then o=$(git hash-object -- "./$p") || exit 1; printf '%s\\0' "$o"
  elif test -e "./$p"; then printf 'x\\0'
  else printf -- '-\\0'; fi
done`;
const deletedBranchMarker = "Legend Git deleted branch";
const undoReflogAction = "legend-git undo";

export const discardRefPrefix = "refs/legend-git/discarded/";
const restoredRefPrefix = "refs/legend-git/restored/";
const replacedRefPrefix = "refs/legend-git/replaced/";
const backupMarker = "Legend Git discard backup";
// Refuses a path whose parent is a symbolic link, so neither script can read or write outside the worktree.
const parentCheck = `inside() { d=$(dirname -- "$1"); while test "$d" != .; do if test -L "$d"; then echo "Refusing $2: its folder $d is a symbolic link." >&2; exit 1; fi; d=$(dirname -- "$d"); done; }`;
// Prints "<mode> <oid>" or "-" (missing) per path, NUL-separated, storing the exact worktree bytes (no clean filters).
const backupProbe = `${parentCheck}
cd "$1" || exit; shift
for p do
  f="./$p"; inside "$f" "$p"
  if test -L "$f"; then o=$(readlink -n "$f" | git hash-object -w --stdin) || exit 1; printf '120000 %s\\0' "$o"
  elif test -f "$f"; then o=$(git hash-object -w --no-filters -- "$f") || exit 1; if test -x "$f"; then m=100755; else m=100644; fi; printf '%s %s\\0' "$m" "$o"
  elif test -e "$f"; then echo "Cannot back up $p: it is not a regular file or symbolic link." >&2; exit 1
  else printf -- '-\\0'; fi
done`;
// Writes "<mode> <oid> <path>" triples back to the worktree byte-for-byte; mode "-" deletes the path.
// Every path is checked before anything is written.
const restoreScript = `${parentCheck}
cd "$1" || exit; shift
i=0; for x do i=$((i + 1)); if test $((i % 3)) -eq 0; then inside "./$x" "$x"; fi; done
while test $# -ge 3; do m=$1; o=$2; f="./$3"; shift 3
  if test "$m" = -; then rm -f -- "$f" || exit 1; continue; fi
  d=$(dirname -- "$f"); mkdir -p -- "$d" || exit 1
  t=$(mktemp "$d/.legend-git-restore.XXXXXX") || exit 1
  if test "$m" = 120000; then l=$(git cat-file blob "$o" && printf x) || { rm -f -- "$t"; exit 1; }; rm -f -- "$t"; ln -s -- "\${l%x}" "$t" || exit 1
  else git cat-file blob "$o" > "$t" || { rm -f -- "$t"; exit 1; }; if test "$m" = 100755; then chmod 755 -- "$t"; else chmod 644 -- "$t"; fi; fi
  rm -f -- "$f"; mv -f -- "$t" "$f" || exit 1
done`;
// Prints "plain" when the file's bytes survive Git's clean and smudge conversions unchanged, so a
// worktree \`git apply\` (which converts on read and write) touches only the patched lines.
const plainProbe = `cd "$1" || exit; f="./$2"
test -L "$f" && exit 0
r=$(git hash-object -w --no-filters -- "$f") || exit 1
c=$(git hash-object -- "$f") || exit 1
s=$(git cat-file --filters --path="$2" "$r" | git hash-object --no-filters --stdin) || exit 1
if test "$r" = "$c" && test "$r" = "$s"; then echo plain; fi`;

export class GitServiceError extends Error {
  readonly code: GitErrorCode;
  readonly args: readonly string[];

  constructor(code: GitErrorCode, message: string, args: readonly string[] = []) {
    super(message);
    this.name = "GitServiceError";
    this.code = code;
    this.args = args;
  }
}

/** `git branch -d` refused because the branch has commits that are not merged. */
export class GitBranchNotMergedError extends Error {
  readonly branch: string;

  constructor(branch: string, message: string) {
    super(message);
    this.name = "GitBranchNotMergedError";
    this.branch = branch;
  }
}

/** `git switch` refused because uncommitted changes would be overwritten; nothing changed. */
export class GitLocalChangesError extends Error {
  readonly branch: string;

  constructor(branch: string, message: string) {
    super(message);
    this.name = "GitLocalChangesError";
    this.branch = branch;
  }
}

/** `git stash pop` applied the stash but couldn't drop it; the changes are in the worktree and the stash is still listed. */
export class GitStashDropError extends Error {
  constructor(message: string) {
    super(`The stash was applied, but Git couldn’t remove it from the list: ${message}`);
    this.name = "GitStashDropError";
  }
}

export class GitIndexLockedError extends GitServiceError {
  readonly lockPath: string;

  constructor(lockPath: string) {
    super("index-locked", `Git index is locked at ${lockPath}. Wait for the other Git operation to finish, then retry.`);
    this.name = "GitIndexLockedError";
    this.lockPath = lockPath;
  }
}

const discoveryQueues = new Map<string, Promise<void>>();
// Worktree writes change the shared repository, so they also serialize on its common dir across every worktree's service.
const commonQueues = new Map<string, Promise<void>>();
const repoQueues = new Map<string, Promise<void>>();
const stateProbe = `cat "$1/HEAD" || exit
printf '\\0'
for name in index.lock MERGE_HEAD rebase-apply rebase-merge CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
  if test -e "$1/$name"; then printf '%s\\0' "$name"; fi
done`;

// Prints "<name>\0<first line>\0" for each operation file present in the git dir.
const operationProbe = `for name in rebase-merge/head-name rebase-merge/onto rebase-merge/msgnum rebase-merge/end rebase-apply/head-name rebase-apply/onto rebase-apply/next rebase-apply/last rebase-apply/applying MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_START; do
  if test -f "$1/$name"; then printf '%s\\0' "$name"; head -n 1 "$1/$name" | tr -d '\\000\\n'; printf '\\0'; fi
done`;
// Prints "missing", "link" (a link or submodule) or "markers" for a conflicted worktree file, else its blob id (with Git's clean filters).
const conflictProbe = `if test -L "$1" || test -d "$1"; then echo link; elif ! test -e "$1"; then echo missing; elif grep -qE '^(<<<<<<<|>>>>>>>)( |$)' -- "$1"; then echo markers; else git hash-object -- "$1"; fi`;
// Writes the union of blobs ours ($1), base ($2, empty for add/add) and theirs ($3) as a blob and prints its id.
const unionMerge = `set -e
dir=$(mktemp -d "\${TMPDIR:-/tmp}/legend-git-union.XXXXXX"); trap 'rm -rf "$dir"' EXIT
git cat-file blob "$1" > "$dir/ours"; if test -n "$2"; then git cat-file blob "$2" > "$dir/base"; else : > "$dir/base"; fi; git cat-file blob "$3" > "$dir/theirs"
git merge-file -q --union "$dir/ours" "$dir/base" "$dir/theirs" || test $? -lt 127
git hash-object -w --no-filters -- "$dir/ours"`;
const operationCommands: Record<Exclude<GitOperationKind, "bisect">, readonly string[]> = { merge: ["merge"], rebase: ["rebase"], "cherry-pick": ["cherry-pick"], revert: ["revert"] };

const diffFormat = ["-c", "diff.suppressBlankEmpty=false", "-c", "diff.noprefix=false", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/", "--ignore-submodules=none"];

function isRepoPath(path: string) {
  return !!path && !path.includes("\0") && !path.startsWith("/") && !path.split("/").some(part => part === ".." || part === "." || !part);
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new GitServiceError("aborted", "Git operation was cancelled.");
}

function serialize<T>(queues: Map<string, Promise<void>>, key: string, operation: () => Promise<T>) {
  const pending = (queues.get(key) ?? Promise.resolve()).then(operation);
  const tail = pending.then(() => {}, () => {});
  queues.set(key, tail);
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return pending;
}

/** Internal: extra environment and streamed stderr for one command. */
type GitProcessOptions = GitReadOptions & { processEnv?: Readonly<Record<string, string>>; onStderr?: (text: string) => void };

/** One `--progress` report: Git's phase ("Receiving objects") and its percentage. */
export type GitProgress = { phase: string; percent: number };
/** Network operations run until `signal` aborts them or `timeoutMs` (default 30 minutes) passes. */
export type GitNetworkOptions = GitReadOptions & { onProgress?: (progress: GitProgress) => void; timeoutMs?: number };
export type GitFetchOptions = GitNetworkOptions & { remote?: string; prune?: boolean };
/** `setUpstream` names the remote for a branch's first push (`git push --set-upstream <remote> <branch>`). */
export type GitPushOptions = GitNetworkOptions & { setUpstream?: string };

/** The remote refused the push because it has commits the branch doesn't (fetch first / non-fast-forward). */
export class GitPushRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitPushRejectedError";
  }
}

/** Pull can only fast-forward, and the branch and its upstream both have new commits; nothing changed. */
export class GitPullDivergedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitPullDivergedError";
  }
}

/** The current branch has no upstream to pull from or push to. */
export class GitNoUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitNoUpstreamError";
  }
}

// The phase may be translated, so it is anything up to the colon that doesn't start with a digit.
const progressLine = /^(?:remote: *)?([^\d\s:\r\n][^:\r\n]*): +(\d{1,3})% \(/;

/** Calls `onProgress` for every complete `--progress` line in the stderr chunks it is fed (lines end with \r or \n). */
export function createProgressParser(onProgress: (progress: GitProgress) => void) {
  let pending = "";
  return (chunk: string) => {
    const lines = (pending + chunk).split(/[\r\n]/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const match = progressLine.exec(line);
      if (match) onProgress({ phase: match[1]!.trim(), percent: Math.min(100, Number(match[2])) });
    }
  };
}

/** Git's stderr without the `--progress` lines, so an error message holds only what Git said. */
export function withoutProgress(text: string) {
  if (!text.includes("\r") && !/% \(/.test(text)) return text;
  return text.split(/\r\n|\r|\n/).filter(line => !progressLine.test(line) && !/^(?:remote: *)?(?:Enumerating objects|Total \d)/.test(line)).join("\n");
}

/** Decodes stderr chunks up to their last \r or \n, so a UTF-8 character split between chunks is decoded whole. */
function lineDecoder(decode: GitDecoder, onText: (text: string) => void) {
  let pending = new Uint8Array(0);
  return ({ stream, bytes }: { stream: "stdout" | "stderr"; bytes: Uint8Array }) => {
    if (stream !== "stderr") return;
    const joined = new Uint8Array(pending.length + bytes.length);
    joined.set(pending);
    joined.set(bytes, pending.length);
    let end = joined.length;
    while (end > 0 && joined[end - 1] !== 10 && joined[end - 1] !== 13) end--;
    pending = joined.slice(end);
    if (end) onText(decode(joined.subarray(0, end)));
  };
}

const networkQueues = new Map<string, Promise<void>>();
const networkTimeout = 30 * 60_000;

export type GitPerson = { name: string; email: string; time: number };
export type GitCommitDetails = { oid: string; parents: string[]; author: GitPerson; committer: GitPerson; message: string };
export type GitRefDecoration = { kind: "branch" | "remote" | "tag"; name: string };

export function parseCommitDetails(output: string): GitCommitDetails {
  const [oid = "", parents = "", authorName = "", authorEmail = "", authorTime = "", committerName = "", committerEmail = "", committerTime = "", ...message] = output.split("\0");
  return {
    oid,
    parents: parents.split(" ").filter(Boolean),
    author: { name: authorName, email: authorEmail, time: Number(authorTime) },
    committer: { name: committerName, email: committerEmail, time: Number(committerTime) },
    message: message.join("\0").replace(/\n+$/, ""),
  };
}

/** One commit in a file's history: the path the file had in it, and the path it was renamed from there. */
export type GitFileHistoryCommit = {
  oid: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  time: number;
  summary: string;
  status: string;
  path: string;
  oldPath: string | null;
};
export type GitFileHistoryPage = { commits: GitFileHistoryCommit[]; done: boolean };

/**
 * Parses `git log --follow -z --name-status` records that each start with \x1e. A record without a
 * status line (a merge) keeps the path of the newer record, starting from `path`.
 */
export function parseFileHistory(output: string, path: string): GitFileHistoryCommit[] {
  const commits: GitFileHistoryCommit[] = [];
  let current = path;
  for (const record of output.split("\x1e")) {
    if (!record) continue;
    const [oid = "", parents = "", authorName = "", authorEmail = "", time = "", summary = "", rawStatus = "", first = "", second] = record.split("\0");
    const status = rawStatus.trim();
    const renamed = status.startsWith("R") && second !== undefined;
    if (status) current = renamed ? second : first;
    commits.push({ oid, parents: parents.split(" ").filter(Boolean), authorName, authorEmail, time: Number(time), summary, status: status.slice(0, 1), path: current, oldPath: renamed ? first : null });
    if (renamed) current = first;
  }
  return commits;
}

export type GitHistorySearchScope = "message" | "author" | "path" | "content";
export type GitHistorySearchPage = { commits: GitFileHistoryCommit[]; done: boolean };

const searchArgs: Record<GitHistorySearchScope, (text: string) => { options: string[]; paths: string[] }> = {
  // Fixed strings, case-insensitive, like a search field: "fix(" finds "fix(" and does not fail as a regex.
  message: text => ({ options: ["--regexp-ignore-case", "--fixed-strings", `--grep=${text}`], paths: [] }),
  author: text => ({ options: ["--regexp-ignore-case", "--fixed-strings", `--author=${text}`], paths: [] }),
  // Without :(glob), `*` also matches `/`, so "parser" finds any path containing it.
  path: text => ({ options: [], paths: [`:(icase)*${text.replace(/[*?[\\]/g, "\\$&")}*`] }),
  content: text => ({ options: [`-S${text}`], paths: [] }),
};

export function parseRefDecorations(output: string) {
  const decorations = new Map<string, GitRefDecoration[]>();
  for (const line of output.split("\n")) {
    const [object = "", peeled = "", ref = "", symref = ""] = line.split("\0");
    if (!object || symref) continue;
    const kind = ref.startsWith("refs/heads/") ? "branch" : ref.startsWith("refs/remotes/") ? "remote" : ref.startsWith("refs/tags/") ? "tag" : null;
    if (!kind) continue;
    const oid = peeled || object;
    const list = decorations.get(oid) ?? [];
    list.push({ kind, name: ref.slice(ref.indexOf("/", 5) + 1) });
    decorations.set(oid, list);
  }
  return decorations;
}

/**
 * Splits `for-each-ref` output (fields joined by NUL) into branches, remote branches by remote and tags. The default
 * branch is the one a remote's HEAD points at (origin's first), else origin's or the local main or master.
 */
export function parseRefList(output: string, remoteNames: readonly string[]): GitRefList {
  const list: GitRefList = { branches: [], remotes: remoteNames.map(name => ({ name, branches: [] })), tags: [], defaultBranch: null };
  const remoteHeads = new Map<string, string>();
  // The longest remote name that prefixes the ref wins, so "a/b" is not split as remote "a".
  const remotes = [...list.remotes].sort((a, b) => b.name.length - a.name.length);
  for (const line of output.split("\n")) {
    const [ref = "", object = "", peeled = "", head = "", upstream = "", symref = "", time = "", track = ""] = line.split("\0");
    if (symref && ref.startsWith("refs/remotes/") && ref.endsWith("/HEAD")) remoteHeads.set(ref.slice(13, -5), symref);
    if (!object || symref) continue;
    const oid = peeled || object;
    if (ref.startsWith("refs/heads/")) {
      list.branches.push({
        name: ref.slice(11), ref, oid, current: head === "*", upstream: upstream || null, time: Number(time) || 0,
        ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0), behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0), gone: track === "gone",
      });
    } else if (ref.startsWith("refs/tags/")) {
      list.tags.push({ name: ref.slice(10), ref, oid });
    } else if (ref.startsWith("refs/remotes/")) {
      const name = ref.slice(13);
      const remote = remotes.find(entry => name.startsWith(`${entry.name}/`));
      if (remote) remote.branches.push({ name, ref, oid, remote: remote.name, branch: name.slice(remote.name.length + 1) });
    }
  }
  const exists = (ref: string) => list.branches.some(entry => entry.ref === ref) || list.remotes.some(remote => remote.branches.some(entry => entry.ref === ref));
  list.defaultBranch = [remoteHeads.get("origin"), ...remoteHeads.values(), "refs/remotes/origin/main", "refs/remotes/origin/master", "refs/heads/main", "refs/heads/master"]
    .find(ref => ref && exists(ref)) ?? null;
  return list;
}

/** The github.com page for a commit, or null when the remote URL is not on github.com. */
/** Parses `git stash list -z --format=%H%x00%gd%x00%gs%x00%ct`. */
export function parseStashList(output: string): GitStash[] {
  const fields = output.split("\0");
  const stashes: GitStash[] = [];
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const [oid = "", selector = "", message = "", time = ""] = fields.slice(index, index + 4);
    const position = /^stash@\{(\d+)\}$/.exec(selector);
    if (oid && position) stashes.push({ oid, index: Number(position[1]), message, time: Number(time) || 0 });
  }
  return stashes;
}

/** Parses `git worktree list --porcelain -z`: attribute fields, each record ended by an empty field; the main worktree comes first. */
export function parseWorktreeList(output: string): GitWorktree[] {
  const worktrees: GitWorktree[] = [];
  let current: GitWorktree | null = null;
  for (const field of output.split("\0")) {
    if (!field) { current = null; continue; }
    const space = field.indexOf(" ");
    const [key, value] = space < 0 ? [field, ""] : [field.slice(0, space), field.slice(space + 1)];
    if (key === "worktree") {
      current = { path: value, head: null, branch: null, detached: false, bare: false, locked: null, prunable: null, main: !worktrees.length };
      worktrees.push(current);
    } else if (!current) continue;
    else if (key === "HEAD") current.head = /^0+$/.test(value) ? null : value;
    else if (key === "branch") current.branch = value.replace(/^refs\/heads\//, "");
    else if (key === "detached") current.detached = true;
    else if (key === "bare") current.bare = true;
    else if (key === "locked") current.locked = value;
    else if (key === "prunable") current.prunable = value;
  }
  return worktrees;
}

/** The number of changed paths in `git status --porcelain -z` output; a rename or copy carries its old path as an extra field. */
export function countStatusEntries(output: string) {
  const fields = output.split("\0");
  let count = 0;
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field.length < 4) continue;
    count += 1;
    if (/^[RC]|^.[RC]/.test(field)) index += 1;
  }
  return count;
}

/** The owner and name of a repository on github.com from a remote URL (https, ssh, git or scp-like); null for other hosts. */
export function githubRepository(remoteUrl: string | null | undefined) {
  const match = remoteUrl?.trim().match(/^(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/|[^@/]+@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1]!, name: match[2]! } : null;
}

export function githubCommitUrl(remoteUrl: string | null, oid: string) {
  const repo = githubRepository(remoteUrl);
  return repo ? `https://github.com/${repo.owner}/${repo.name}/commit/${oid}` : null;
}

export class GitService {
  private gitDir: string | undefined;
  private commonGitDir: string | undefined;
  private readonly operations: GitOperationLog[] = [];
  private readonly runner: GitRunner;
  private readonly decode: GitDecoder;
  readonly repoRoot: string;

  /** `decode` defaults to TextDecoder; React Native hosts without it pass their own. */
  constructor(repoRoot: string, runner: GitRunner, decode: GitDecoder = bytes => new TextDecoder().decode(bytes)) {
    this.repoRoot = repoRoot.replace(/\/+$/, "") || "/";
    this.runner = runner;
    this.decode = decode;
  }

  getOperationLog(): readonly GitOperationLog[] {
    return this.operations.map((entry) => ({ ...entry, args: [...entry.args] }));
  }

  /**
   * Runs `operation` on the repository queue. An abort rejects the caller at once unless the operation has called
   * `commit`, after which the caller waits for its real outcome.
   */
  private enqueue<T>(options: GitReadOptions, operation: (gitDir: string, commit: () => void) => Promise<T>): Promise<T> {
    const { signal } = options;
    let committed = false;
    const commit = () => {
      checkAborted(signal);
      committed = true;
    };
    const pending = serialize(discoveryQueues, this.repoRoot, async () => {
      checkAborted(signal);
      const gitDir = this.gitDir ??= (await this.git(["rev-parse", "--absolute-git-dir"], options)).replace(/\n$/, "");
      return serialize(repoQueues, gitDir, () => {
        checkAborted(signal);
        return operation(gitDir, commit);
      });
    });
    if (!signal) return pending;
    let onAbort: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => { if (!committed) reject(new GitServiceError("aborted", "Git operation was cancelled.")); };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return Promise.race([pending, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
  }

  private async process(command: string, args: readonly string[], options: GitProcessOptions, timeoutMs = 60_000, input?: string, okCodes: readonly number[] = [0]): Promise<string> {
    checkAborted(options.signal);
    const entry: GitOperationLog = { command, args: [...args], startedAt: Date.now(), endedAt: null, exit: null, stderrTail: "" };
    this.operations.push(entry);
    if (this.operations.length > 100) this.operations.shift();
    try {
      const result = await this.runner({
        target: { type: "command", name: command },
        args,
        cwd: this.repoRoot,
        env: { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...options.processEnv },
        signal: options.signal,
        input,
        timeoutMs,
        ...options.onStderr ? { onOutput: lineDecoder(this.decode, options.onStderr) } : {},
      });
      entry.exit = result.exit;
      entry.stderrTail = withoutProgress(this.decode(result.stderr)).slice(-4096);
      checkAborted(options.signal);
      if (result.aborted) throw new GitServiceError("aborted", "Git operation was cancelled.", args);
      if (result.timedOut) throw new GitServiceError("timed-out", `${command} timed out.`, args);
      if (result.outputTruncated) throw new GitServiceError("output-truncated", `${command} output exceeded the capture limit.`, args);
      if (result.exit.type !== "exited" || !okCodes.includes(result.exit.code)) {
        if (/index\.lock/.test(entry.stderrTail)) throw new GitIndexLockedError(`${this.gitDir ?? `${this.repoRoot}/.git`}/index.lock`);
        // Merges (stash apply) report conflicts on stdout.
        const conflicts = this.decode(result.stdout).split("\n").filter(line => line.startsWith("CONFLICT")).join("\n");
        throw new GitServiceError("command-failed", [entry.stderrTail.trim(), conflicts].filter(Boolean).join("\n") || `${command} failed (${result.exit.type === "exited" ? result.exit.code : "terminated"}).`, args);
      }
      return this.decode(result.stdout);
    } catch (error) {
      if (!entry.stderrTail) entry.stderrTail = (error instanceof Error ? error.message : String(error)).slice(-4096);
      checkAborted(options.signal);
      throw error;
    } finally {
      entry.endedAt = Date.now();
    }
  }

  private git(args: readonly string[], options: GitProcessOptions, timeoutMs = 60_000, input?: string, okCodes?: readonly number[]) {
    return this.process("git", ["-c", "core.quotepath=off", ...args], options, timeoutMs, input, okCodes);
  }

  private async inspect(gitDir: string, options: GitReadOptions): Promise<GitRepoState> {
    const [head = "", ...markers] = (await this.process("sh", ["-c", stateProbe, "legend-diff-state", gitDir], options)).split("\0");
    if (markers.includes("index.lock")) throw new GitIndexLockedError(`${gitDir}/index.lock`);
    const branch = head.startsWith("ref: refs/heads/") ? head.slice(16).replace(/\n$/, "") : null;
    return {
      gitDir,
      branch,
      detachedCommit: head.startsWith("ref: ") ? null : head.trim(),
      detached: !head.startsWith("ref: "),
      merging: markers.includes("MERGE_HEAD"),
      rebasing: markers.includes("rebase-merge") ? "merge" : markers.includes("rebase-apply") ? "apply" : null,
      cherryPicking: markers.includes("CHERRY_PICK_HEAD"),
      reverting: markers.includes("REVERT_HEAD"),
      bisecting: markers.includes("BISECT_LOG"),
    };
  }

  private read(args: readonly string[], options: GitReadOptions, timeoutMs = 60_000, requiresIndex = false, okCodes?: readonly number[]) {
    return this.enqueue(options, async (gitDir) => {
      if (requiresIndex) await this.inspect(gitDir, options);
      return this.git(args, options, timeoutMs, undefined, okCodes);
    });
  }

  status(options: GitReadOptions = {}) {
    return this.read(["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignored=no"], options, 60_000, true).then(parseGitStatus);
  }

  private changeFile(path: string, stage: boolean, options: GitReadOptions) {
    if (!isRepoPath(path)) {
      return Promise.reject(new Error("Expected a repository-relative file path."));
    }
    return this.enqueue(options, async (gitDir) => {
      await this.inspect(gitDir, options);
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const status = parseGitStatus(await this.git(["-C", root, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"], options));
      const entry = status.entries.find(entry => entry.path === path);
      if (!entry) throw new Error("The file is no longer in Git status. Refresh and try again.");
      const paths = [path];
      if (entry.kind === "renamed" && entry.originalPath && (!stage || entry.worktreeStatus === "R")) paths.push(entry.originalPath);
      const prefix = ["-C", root, "--literal-pathspecs"];
      if (stage) {
        await this.git([...prefix, "update-index", "--add", "--remove", "--", ...paths], options);
      } else if (status.branch.oid === "(initial)") {
        await this.git([...prefix, "update-index", "--force-remove", "--", ...paths], options);
      } else {
        const head = status.branch.oid;
        if (!head) throw new Error("Git status did not report HEAD.");
        const entries = (await this.git([...prefix, "ls-tree", "--full-tree", "-z", head, "--", ...paths], options)).split("\0").filter(record => {
          const separator = record.indexOf("\t");
          return separator >= 0 && paths.includes(record.slice(separator + 1)) && !record.startsWith("040000 ");
        });
        const indexedPaths = (await this.git([...prefix, "ls-files", "--stage", "-z"], options)).split("\0").filter(Boolean).map(record => record.slice(record.indexOf("\t") + 1));
        const restoredPaths = entries.map(record => record.slice(record.indexOf("\t") + 1));
        if (restoredPaths.some(restored => indexedPaths.some(indexed => !paths.includes(indexed) && (indexed.startsWith(`${restored}/`) || restored.startsWith(`${indexed}/`))))) {
          throw new Error("Cannot unstage this file while a staged replacement occupies its parent or child path. Unstage the replacement first.");
        }
        const removals = paths.map(path => `0 ${"0".repeat(head.length)}\t${path}`);
        await this.git([...prefix, "update-index", "-z", "--index-info"], options, 60_000, [...removals, ...entries, ""].join("\0"));
      }
    });
  }

  /**
   * Reads one file's patch for the unstaged (index → worktree) or staged (HEAD → index) side,
   * in a stable format `git apply` accepts regardless of the user's diff config.
   * Untracked files diff against /dev/null; staged renames pass both paths so Git pairs them.
   */
  fileDiff(file: { path: string; originalPath?: string | null; untracked?: boolean }, staged: boolean, options: GitReadOptions = {}) {
    const paths = [file.path, ...(staged && file.originalPath ? [file.originalPath] : [])];
    if (paths.some(path => !isRepoPath(path))) return Promise.reject(new Error("Expected a repository-relative file path."));
    if (!staged && file.untracked) return this.read([...diffFormat, "--no-index", "--", "/dev/null", file.path], options, 60_000, false, [0, 1]);
    return this.read(["--literal-pathspecs", ...diffFormat, ...(staged ? ["--cached", "-M"] : ["--no-renames"]), "--", ...paths], options, 60_000, true);
  }

  /**
   * Reads the whole staged diff (HEAD → index, renames detected) in `fileDiff`'s format, one file at a time, until the
   * patch reaches `maxChars` characters; the file that crosses it is cut on a line boundary. Binary files are listed by
   * name only, and files past the cap or with more than `maxFileLines` changed lines are reported in `omitted`.
   */
  stagedDiff(options: GitReadOptions & { maxChars?: number; maxFileLines?: number } = {}): Promise<GitStagedDiff> {
    const { maxChars = 48_000, maxFileLines = 20_000 } = options;
    return this.enqueue(options, async (gitDir) => {
      await this.inspect(gitDir, options);
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const fields = (await this.git(["-C", root, "-c", "diff.submodule=short", "diff", "--cached", "-M", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--numstat", "-z"], options)).split("\0");
      const files: GitStagedFile[] = [];
      for (let index = 0; index < fields.length - 1;) {
        // "added<TAB>deleted<TAB>path", or "added<TAB>deleted<TAB>" followed by the old and new paths for a rename.
        const [, added = "", deleted = "", path = ""] = /^([^\t]*)\t([^\t]*)\t([\s\S]*)$/.exec(fields[index++]!) ?? [];
        const originalPath = path === "" ? fields[index++]! : null;
        files.push({ path: originalPath === null ? path : fields[index++]!, originalPath, binary: added === "-", added: Number(added) || 0, deleted: Number(deleted) || 0 });
      }
      let patch = "";
      const omitted: string[] = [];
      for (const file of files) {
        if (file.binary) continue;
        if (patch.length >= maxChars || file.added + file.deleted > maxFileLines) { omitted.push(file.path); continue; }
        const paths = file.originalPath ? [file.originalPath, file.path] : [file.path];
        const text = (await this.git(["-C", root, "--literal-pathspecs", "-c", "diff.submodule=short", ...diffFormat, "--cached", "-M", "--", ...paths], options)).replace(/\0/g, "\\0");
        if (patch.length + text.length <= maxChars) { patch += text; continue; }
        patch += text.slice(0, text.lastIndexOf("\n", maxChars - patch.length) + 1);
        omitted.push(file.path);
      }
      return { files, patch, truncated: omitted.length > 0, omitted };
    });
  }

  /**
   * Applies a patch, optionally reversed, after checking index.lock: to the index only (`git apply --cached`) by default,
   * or to the worktree only with `target: "worktree"` (see `GitApplyPatchOptions`). `verify` runs on the repository
   * queue, so it must not call this service for the same repository.
   */
  applyPatch(patch: string, options: GitApplyPatchOptions = {}) {
    const flags = ["--whitespace=nowarn", "--no-ignore-whitespace", ...(options.reverse ? ["--reverse"] : [])];
    return this.enqueue(options, async (gitDir, commit) => {
      await this.inspect(gitDir, options);
      if (options.target !== "worktree") {
        await this.git(["apply", "--cached", ...flags, "-"], options, 60_000, patch);
        return;
      }
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      await options.verify?.(options.signal);
      await this.git(["-C", root, "apply", "--check", ...flags, "-"], options, 60_000, patch);
      await options.verify?.(options.signal);
      commit();
      await this.git(["-C", root, "apply", ...flags, "-"], {}, 60_000, patch);
    });
  }

  /** Paths' authoritative status entries, refusing anything a worktree write must not touch. */
  private async worktreeEntries(paths: readonly string[], options: GitReadOptions) {
    if (!paths.length || paths.some(path => !isRepoPath(path))) throw new Error("Expected repository-relative file paths.");
    const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
    const status = parseGitStatus(await this.git(["-C", root, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"], options));
    const entries = paths.map(path => {
      const entry = status.entries.find(item => item.path === path);
      if (!entry || entry.worktreeStatus === ".") throw new Error(`${path} has no unstaged changes. Refresh and try again.`);
      if (entry.kind === "unmerged") throw new Error(`${path} has merge conflicts. Resolve them before discarding.`);
      if (entry.submodule?.startsWith("S")) throw new Error(`${path} is a submodule; discard its changes inside the submodule.`);
      if (entry.worktreeStatus === "A") throw new Error(`${path} is marked intent-to-add; unstage it before discarding.`);
      return entry;
    });
    return { root, entries };
  }

  /** Saves the paths' current worktree bytes as a parentless commit on a new hidden ref, without touching the index or stash. */
  private async backup(root: string, paths: readonly string[], prefix: string, options: GitReadOptions): Promise<GitDiscardBackup> {
    const records = (await this.process("sh", ["-c", backupProbe, "legend-git-backup", root, ...paths], options)).split("\0");
    const entries: GitBackupEntry[] = paths.map((path, index) => {
      const [mode, oid] = records[index]!.split(" ");
      return mode === "-" ? { path, mode: null } : { path, mode: mode as "100644", oid: oid! };
    });
    const tree = await this.tree(entries.flatMap(entry => entry.mode ? [entry] : []), options);
    const message = `${backupMarker}\n\n${JSON.stringify({ version: 1, entries })}\n`;
    const identity = ["-c", "user.name=Legend Git", "-c", "user.email=legend-git@localhost", "-c", "commit.gpgsign=false"];
    const oid = (await this.git([...identity, "commit-tree", tree], options, 60_000, message)).trim();
    for (let attempt = 0; ; attempt += 1) {
      const ref = `${prefix}${String(Date.now()).padStart(15, "0")}-${attempt}`;
      try {
        await this.git(["update-ref", "-m", "legend-git: backup before worktree write", ref, oid, "0".repeat(oid.length)], options);
        return { ref, oid, entries };
      } catch (error) {
        if (attempt >= 5) throw error;
      }
    }
  }

  private async tree(entries: readonly { path: string; mode: string; oid: string }[], options: GitReadOptions): Promise<string> {
    const children = new Map<string, { path: string; mode: string; oid: string }[]>();
    const lines: string[] = [];
    for (const entry of entries) {
      const slash = entry.path.indexOf("/");
      if (slash < 0) { lines.push(`${entry.mode} blob ${entry.oid}\t${entry.path}`); continue; }
      const name = entry.path.slice(0, slash);
      children.set(name, [...children.get(name) ?? [], { ...entry, path: entry.path.slice(slash + 1) }]);
    }
    for (const [name, nested] of children) lines.push(`040000 tree ${await this.tree(nested, options)}\t${name}`);
    return (await this.git(["mktree", "-z"], options, 60_000, lines.map(line => `${line}\0`).join(""))).trim();
  }

  /**
   * Discards the unstaged changes of whole files after backing them up to a hidden ref:
   * tracked files are restored from the index, untracked files are deleted. The index is not written.
   */
  discardFiles(paths: readonly string[], options: GitReadOptions = {}) {
    return this.enqueue(options, async (gitDir) => {
      await this.inspect(gitDir, options);
      const { root, entries } = await this.worktreeEntries(paths, options);
      const backup = await this.backup(root, paths, discardRefPrefix, options);
      const tracked = entries.filter(entry => entry.kind !== "untracked").map(entry => entry.path);
      const untracked = entries.filter(entry => entry.kind === "untracked").map(entry => entry.path);
      return this.withBackup(backup, async () => {
        if (tracked.length) await this.git(["-C", root, "checkout-index", "--force", "--", ...tracked], options);
        if (untracked.length) await this.git(["-C", root, "--literal-pathspecs", "clean", "--force", "--quiet", "--", ...untracked], options);
      });
    });
  }

  /** Reverse-applies a patch built from one file's unstaged diff to the worktree (never the index), after backing the file up. */
  discardPatch(path: string, patch: string, options: GitReadOptions = {}) {
    return this.enqueue(options, async (gitDir) => {
      await this.inspect(gitDir, options);
      const { root } = await this.worktreeEntries([path], options);
      if ((await this.process("sh", ["-c", plainProbe, "legend-git-plain", root, path], options)).trim() !== "plain") {
        throw new Error(`${path} uses line-ending conversion or a filter, so discarding part of it could rewrite other lines. Discard the whole file instead.`);
      }
      const backup = await this.backup(root, [path], discardRefPrefix, options);
      return this.withBackup(backup, () => this.git(["-C", root, "apply", "--reverse", "--whitespace=nowarn", "--no-ignore-whitespace", "-"], options, 60_000, patch));
    });
  }

  /** Runs a worktree write; when it fails or is cancelled, its backup ref is dropped so it is never offered for restore. */
  private async withBackup(backup: GitDiscardBackup, write: () => Promise<unknown>) {
    try {
      await write();
      return backup;
    } catch (error) {
      await this.git(["update-ref", "-d", backup.ref, backup.oid], {}).catch(() => {});
      throw error;
    }
  }

  private async readBackup(ref: string, options: GitReadOptions): Promise<GitDiscardBackup> {
    const oid = (await this.git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], options)).trim();
    const commit = await this.git(["cat-file", "commit", oid], options);
    const body = commit.slice(commit.indexOf("\n\n") + 2);
    if (!body.startsWith(`${backupMarker}\n\n`)) throw new Error(`${ref} is not a Legend Git discard backup.`);
    const { entries } = JSON.parse(body.slice(backupMarker.length + 2)) as { entries: GitBackupEntry[] };
    if (!Array.isArray(entries) || entries.some(entry => !isRepoPath(entry.path) || (entry.mode !== null && (!["100644", "100755", "120000"].includes(entry.mode) || !/^[0-9a-f]{40,64}$/.test(entry.oid))))) {
      throw new Error(`${ref} has an unreadable backup record.`);
    }
    return { ref, oid, entries };
  }

  /** The newest discard backup that has not been restored, or null. */
  lastDiscard(options: GitReadOptions = {}) {
    return this.enqueue(options, async () => {
      // Only the newest discard is offered; once it is restored, older discards are not.
      const name = (ref: string) => ref.slice(ref.lastIndexOf("/") + 1);
      const newest = (await this.git(["for-each-ref", "--format=%(refname)", discardRefPrefix, restoredRefPrefix], options)).split("\n").filter(Boolean)
        .reduce<string | null>((best, ref) => best === null || name(ref) > name(best) ? ref : best, null);
      return newest?.startsWith(discardRefPrefix) ? this.readBackup(newest, options) : null;
    });
  }

  /**
   * Writes a discard backup's files back into the worktree. The files' current contents are first
   * backed up under refs/legend-git/replaced/, and the discard ref moves to refs/legend-git/restored/.
   */
  restoreDiscard(ref: string, options: GitReadOptions = {}) {
    if (!ref.startsWith(discardRefPrefix) || !isRepoPath(ref)) return Promise.reject(new Error("Expected a Legend Git discard ref."));
    return this.enqueue(options, async (gitDir) => {
      await this.inspect(gitDir, options);
      const backup = await this.readBackup(ref, options);
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const status = parseGitStatus(await this.git(["-C", root, "status", "--porcelain=v2", "-z", "--untracked-files=no"], options));
      const conflicted = backup.entries.find(entry => status.entries.some(item => item.kind === "unmerged" && item.path === entry.path));
      if (conflicted) throw new Error(`${conflicted.path} has merge conflicts. Resolve them before restoring.`);
      const replaced = await this.backup(root, backup.entries.map(entry => entry.path), replacedRefPrefix, options);
      await this.process("sh", ["-c", restoreScript, "legend-git-restore", root, ...backup.entries.flatMap(entry => [entry.mode ?? "-", entry.oid ?? "-", entry.path])], options);
      await this.git(["update-ref", "-m", "legend-git: restored discard", `${restoredRefPrefix}${ref.slice(discardRefPrefix.length)}`, backup.oid, "0".repeat(backup.oid.length)], options);
      await this.git(["update-ref", "-m", "legend-git: restored discard", "-d", ref, backup.oid], options);
      return { restored: backup, replaced };
    });
  }

  /** The full message of HEAD, for prefilling an amend. */
  headMessage(options: GitReadOptions = {}) {
    return this.read(["log", "-1", "--format=%B", "HEAD", "--"], options).then(message => message.replace(/\n+$/, ""));
  }

  /**
   * Commits the index with the message on stdin (`git commit -F -`). Hooks and the user's signing
   * configuration apply; the commit is refused while conflicts remain or, outside amend and merges, nothing is staged.
   */
  commit(input: GitCommitInput, options: GitReadOptions = {}) {
    return this.enqueue(options, async (gitDir) => {
      const state = await this.inspect(gitDir, options);
      if (!input.message.trim()) throw new Error("Enter a commit message.");
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const status = parseGitStatus(await this.git(["-C", root, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=no"], options));
      const conflicts = status.entries.filter(entry => entry.kind === "unmerged").length;
      if (conflicts) throw new Error(`Resolve the merge conflicts in ${conflicts === 1 ? "1 file" : `${conflicts} files`} and stage the results before committing.`);
      if (input.amend && status.branch.oid === "(initial)") throw new Error("There is no commit to amend yet. Turn off Amend to make the first commit.");
      if (!input.amend && !state.merging && !status.entries.some(entry => entry.indexStatus !== ".")) throw new Error("Nothing is staged. Stage changes before committing.");
      await this.git(["-C", root, "commit", "--file=-", ...(input.amend ? ["--amend"] : []), ...(input.signoff ? ["--signoff"] : [])], options, 600_000, input.message);
    });
  }

  stageFile(path: string, options: GitReadOptions = {}) {
    return this.changeFile(path, true, options);
  }

  unstageFile(path: string, options: GitReadOptions = {}) {
    return this.changeFile(path, false, options);
  }

  repoState(options: GitReadOptions = {}) {
    return this.enqueue(options, (gitDir) => this.inspect(gitDir, options));
  }

  /** The operation Git has paused in this worktree, or null. */
  operationState(options: GitReadOptions = {}) {
    return this.enqueue(options, gitDir => this.readOperation(gitDir, options));
  }

  private async readOperation(gitDir: string, options: GitReadOptions): Promise<GitOperation | null> {
    const fields = (await this.process("sh", ["-c", operationProbe, "legend-git-operation", gitDir], options)).split("\0");
    const files = new Map<string, string>();
    for (let index = 0; index + 1 < fields.length; index += 2) files.set(fields[index]!, fields[index + 1]!.trim());
    const rebase = files.has("rebase-merge/head-name") ? "rebase-merge" : files.has("rebase-apply/head-name") && !files.has("rebase-apply/applying") ? "rebase-apply" : null;
    const kind: GitOperationKind | null = rebase ? "rebase" : files.has("MERGE_HEAD") ? "merge" : files.has("CHERRY_PICK_HEAD") ? "cherry-pick"
      : files.has("REVERT_HEAD") ? "revert" : files.has("BISECT_START") ? "bisect" : null;
    if (!kind) return null;
    const head = (await this.process("sh", ["-c", 'cat "$1/HEAD"', "legend-git-head", gitDir], options)).trim();
    const short = (name: string) => name.replace(/^refs\/(heads|remotes|tags)\//, "");
    let branch = head.startsWith("ref: refs/heads/") ? head.slice(16) : null;
    let target: string | null = null, commit: GitOperation["commit"] = null, step: GitOperation["step"] = null;
    if (rebase) {
      const name = files.get(`${rebase}/head-name`)!;
      branch = name.startsWith("refs/heads/") ? short(name) : null;
      target = await this.nameCommit(files.get(`${rebase}/onto`) ?? "", options);
      const [current, total] = rebase === "rebase-merge" ? [files.get("rebase-merge/msgnum"), files.get("rebase-merge/end")] : [files.get("rebase-apply/next"), files.get("rebase-apply/last")];
      if (current && total && Number(total) > 0) step = { current: Number(current), total: Number(total) };
    } else if (kind === "merge") {
      target = await this.nameCommit(files.get("MERGE_HEAD")!, options);
    } else if (kind === "bisect") {
      // BISECT_START holds the branch (or commit) bisect started from.
      const start = files.get("BISECT_START")!;
      branch = start && !/^[0-9a-f]{40,64}$/.test(start) ? start : null;
    } else {
      const oid = files.get(kind === "revert" ? "REVERT_HEAD" : "CHERRY_PICK_HEAD")!;
      const [abbreviated, subject = ""] = (await this.git(["log", "-1", "--format=%h%x00%s", "--end-of-options", oid], options, 10_000, undefined, [0, 128])).replace(/\n$/, "").split("\0");
      commit = { oid: abbreviated || oid.slice(0, 7), subject };
    }
    const conflicts = new Set((await this.git(["ls-files", "-u", "-z"], options, 10_000)).split("\0").filter(Boolean).map(record => record.slice(record.indexOf("\t") + 1))).size;
    return { kind, branch, target, commit, step, conflicts, mergeHead: files.has("MERGE_HEAD") };
  }

  /** A local branch, then a remote branch, then a tag pointing at `oid`; else its abbreviated id. */
  private async nameCommit(oid: string, options: GitReadOptions) {
    if (!/^[0-9a-f]{4,64}$/.test(oid)) return null;
    const names = (await this.git(["for-each-ref", "--points-at", oid, "--format=%(refname)", "refs/heads", "refs/remotes", "refs/tags"], options, 10_000, undefined, [0, 129])).split("\n").filter(name => name && !name.endsWith("/HEAD"));
    const name = ["refs/heads/", "refs/remotes/", "refs/tags/"].map(prefix => names.find(entry => entry.startsWith(prefix))).find(Boolean);
    return name ? name.replace(/^refs\/(heads|remotes|tags)\//, "") : oid.slice(0, 7);
  }

  /**
   * Aborts the paused operation (`git <op> --abort`, `git bisect reset`) as a queued write that refuses while index.lock
   * exists. Rejects, changing nothing, when Git is no longer paused in `kind` (it ended or another one started).
   */
  abortOperation(kind: GitOperationKind, options: GitReadOptions = {}) {
    return this.operationWrite(kind, kind === "bisect" ? ["bisect", "reset"] : [...operationCommands[kind], "--abort"], options);
  }

  /**
   * Continues a merge, rebase, cherry-pick or revert (`git <op> --continue`) with Git's prepared messages; commit hooks run.
   * Git refuses while conflicts are unresolved. Bisect has no continue.
   */
  continueOperation(kind: Exclude<GitOperationKind, "bisect">, options: GitReadOptions = {}) {
    return this.operationWrite(kind, [...operationCommands[kind], "--continue"], options);
  }

  private operationWrite(kind: GitOperationKind, args: readonly string[], options: GitReadOptions) {
    return this.enqueue(options, async (gitDir, commit) => {
      await this.inspect(gitDir, options);
      const current = await this.readOperation(gitDir, options);
      if (current?.kind !== kind) throw new GitServiceError("command-failed", `There’s no ${kind} in progress.`, args);
      commit();
      // `true` as the editor keeps the message Git prepared; nothing waits on a terminal.
      await this.git(args, { processEnv: { GIT_EDITOR: "true" } }, 600_000);
    });
  }

  resolveRoot(options: GitReadOptions = {}) {
    return this.read(["rev-parse", "--show-toplevel"], options).then(value => value.replace(/\n$/, ""));
  }

  watchLocations(options: GitReadOptions = {}) {
    return this.enqueue(options, async (gitDir) => {
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      return {
        root,
        gitDir,
        commonDir: (await this.git(["rev-parse", "--path-format=absolute", "--git-common-dir"], options)).replace(/\n$/, ""),
        ignoredPaths: (await this.git(["-C", root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], options)).split("\0").filter(Boolean),
      };
    });
  }

  revParse(ref: string, options: GitReadOptions = {}) {
    return this.read(["rev-parse", "--verify", "--end-of-options", ref], options).then((value) => value.trim());
  }

  diff(args: readonly string[], options: GitReadOptions & { requiresIndex?: boolean } = {}) {
    return this.read(["diff", "-z", ...args], options, 60_000, options.requiresIndex);
  }

  showCommit(sha: string, options: GitReadOptions & { ignoreWhitespaceChanges?: boolean } = {}) {
    return this.enqueue(options, async () => {
      const commit = (await this.git(["rev-parse", "--verify", "--end-of-options", `${sha}^{commit}`], options)).trim();
      return this.git(["show", "-z", "--format=", "--first-parent", "--root", "--patch", "--no-ext-diff", "--no-color", ...(options.ignoreWhitespaceChanges ? ["--ignore-all-space"] : []), commit, "--"], options);
    });
  }

  /** One commit's message, people, dates and parents; `oid` must name a commit. */
  commitDetails(oid: string, options: GitReadOptions = {}) {
    return this.read(["show", "-s", "--no-show-signature", "--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%B", "--end-of-options", `${oid}^{commit}`, "--"], options).then(parseCommitDetails);
  }

  /**
   * A commit's patch against its first parent (or the empty tree for a root commit), in `fileDiff`'s
   * stable format with renames detected.
   */
  commitPatch(oid: string, options: GitReadOptions = {}) {
    if (!/^[0-9a-f]{4,64}$/i.test(oid)) return Promise.reject(new Error("Expected a commit id."));
    return this.enqueue(options, async () => {
      const [commit = "", parent] = (await this.git(["rev-list", "--parents", "--no-walk", `${oid}^{commit}`], options)).trim().split(" ");
      const base = parent ?? (await this.git(["hash-object", "-t", "tree", "--stdin"], options, 60_000, "")).trim();
      return this.git(["-c", "diff.submodule=short", ...diffFormat, "-M", base, commit, "--"], options);
    });
  }

  /**
   * Commits that touched `path` from HEAD back, following renames like `git log --follow`, `count` at a
   * time from `offset`. Git's own walk is used because it applies its rename heuristics and the
   * commit-graph's changed-path filters. Every page walks from HEAD: `--skip` would skip the commits
   * where `--follow` learns a rename. An unborn HEAD has no history.
   */
  async fileHistory(path: string, { offset = 0, count = 500, ...options }: GitReadOptions & { offset?: number; count?: number } = {}): Promise<GitFileHistoryPage> {
    if (!isRepoPath(path)) throw new Error(`Expected a repository path, got ${JSON.stringify(path)}.`);
    const head = await this.read(["rev-parse", "--verify", "-q", "HEAD"], options, 5_000, false, [0, 1]);
    if (!head.trim()) return { commits: [], done: true };
    const output = await this.read([
      "log", "--follow", "-z", "--no-show-signature", "--name-status", "-M", "--format=%x1e%H%x00%P%x00%an%x00%ae%x00%at%x00%s",
      `--max-count=${offset + count + 1}`, "HEAD", "--", `:(literal)${path}`,
    ], options);
    const commits = parseFileHistory(output, path).slice(offset);
    return { commits: commits.slice(0, count), done: commits.length <= count };
  }

  /**
   * Commits reachable from `head` whose message, author, a changed path or content (`git log -S`)
   * matches `text`, in `git log --topo-order` order, `count` at a time from `offset`. Pages walk from
   * the same `head` oid, so they stay consistent while refs move. Git does the walk: it applies the
   * commit-graph's changed-path filters for paths and has the pickaxe for content.
   */
  async searchHistory(head: string, scope: GitHistorySearchScope, text: string, { offset = 0, count = 500, ...options }: GitReadOptions & { offset?: number; count?: number } = {}): Promise<GitHistorySearchPage> {
    if (!/^[0-9a-f]{40,64}$/i.test(head)) throw new Error("Expected a commit id.");
    if (!text || text.includes("\0")) return { commits: [], done: true };
    const { options: filters, paths } = searchArgs[scope](text);
    // `--skip` counts commits before the pickaxe filters them, so content pages walk from `head` and drop the first `offset`.
    const skip = scope === "content" ? 0 : offset;
    const output = await this.read([
      "log", "--topo-order", "-z", "--no-show-signature", "--format=%x1e%H%x00%P%x00%an%x00%ae%x00%at%x00%s",
      ...filters, `--skip=${skip}`, `--max-count=${offset - skip + count + 1}`, head, "--", ...paths,
    ], options);
    const commits = parseFileHistory(output, "").slice(offset - skip);
    return { commits: commits.slice(0, count), done: commits.length <= count };
  }

  /** The patch from commit `base` to commit `target` (`git diff base target`), in `commitPatch`'s format. */
  compareCommits(base: string, target: string, options: GitReadOptions = {}) {
    if (![base, target].every(oid => /^[0-9a-f]{4,64}$/i.test(oid))) return Promise.reject(new Error("Expected a commit id."));
    return this.read(["-c", "diff.submodule=short", ...diffFormat, "-M", `${base}^{commit}`, `${target}^{commit}`, "--"], options);
  }

  /** Branches, remote branches and tags by the commit they point at; annotated tags are peeled. */
  refDecorations(options: GitReadOptions = {}) {
    return this.read(["for-each-ref", "--format=%(objectname)%00%(*objectname)%00%(refname)%00%(symref)", "refs/heads", "refs/remotes", "refs/tags"], options, 10_000).then(parseRefDecorations);
  }

  /** Local branches, remote branches grouped by remote (symbolic refs such as origin/HEAD left out) and tags, by name. */
  listRefs(options: GitReadOptions = {}) {
    return this.enqueue(options, async () => {
      const [output, remotes] = await Promise.all([
        this.git(["for-each-ref", "--format=%(refname)%00%(objectname)%00%(*objectname)%00%(HEAD)%00%(upstream:short)%00%(symref)%00%(committerdate:unix)%00%(upstream:track,nobracket)", "refs/heads", "refs/remotes", "refs/tags"], options, 10_000),
        this.git(["remote"], options, 5_000),
      ]);
      return parseRefList(output, remotes.split("\n").filter(Boolean));
    });
  }

  /** How many commits each local branch has that `base` (a full ref name) doesn't, by full ref name; one `for-each-ref`. */
  async branchesAhead(base: string, options: GitReadOptions = {}): Promise<Record<string, number>> {
    if (!/^refs\/[^\0\s()]+$/.test(base)) throw new Error("Expected a full ref name.");
    const output = await this.read(["for-each-ref", `--format=%(refname)%00%(ahead-behind:${base})`, "refs/heads"], options, 10_000);
    const counts: Record<string, number> = {};
    for (const line of output.split("\n")) {
      const [ref = "", aheadBehind = ""] = line.split("\0");
      if (ref) counts[ref] = Number(aheadBehind.split(" ")[0]) || 0;
    }
    return counts;
  }

  /** The commits `ref` has that `base` doesn't (`git log base..ref`, both full ref names), newest first, at most `count`. */
  async logRange(base: string, ref: string, { count = 500, ...options }: GitReadOptions & { count?: number } = {}): Promise<GitHistorySearchPage> {
    if (![base, ref].every(name => /^refs\/[^\0\s.][^\0\s]*$/.test(name) && !name.includes(".."))) throw new Error("Expected full ref names.");
    const output = await this.read([
      "log", "--topo-order", "-z", "--no-show-signature", "--format=%x1e%H%x00%P%x00%an%x00%ae%x00%at%x00%s", `--max-count=${count + 1}`, `${base}..${ref}`, "--",
    ], options);
    const commits = parseFileHistory(output, "");
    return { commits: commits.slice(0, count), done: commits.length <= count };
  }

  /** Resolves when `name` is a valid branch name (`git check-ref-format --branch`); rejects with a readable message otherwise. */
  async validateBranchName(name: string, options: GitReadOptions = {}) {
    const invalid = new Error(`“${name}” isn’t a valid branch name.`);
    if (!name.trim() || name !== name.trim() || name.startsWith("-") || name.includes("\0") || name.startsWith("@{")) throw invalid;
    // `--branch` expands "@{-1}" and similar to another branch's name; only a name that comes back unchanged is literal.
    const output = await this.read(["check-ref-format", "--branch", name], options, 5_000, false, [0, 1, 128]).catch(() => "");
    if (output.replace(/\n$/, "") !== name) throw invalid;
  }

  /**
   * Whether local branch `name` is merged by `git branch -d`'s rule: into its upstream when it has one,
   * otherwise into HEAD. Read from the history, not Git's (possibly translated) message.
   */
  private async branchMerged(name: string, options: GitReadOptions) {
    const ref = `refs/heads/${name}`;
    const upstream = (await this.git(["for-each-ref", "--format=%(upstream)", ref], options, 5_000)).split("\n")[0] ?? "";
    // Exit 1 means not an ancestor; any failure counts as not merged, so the user is asked before `-D`.
    return this.git(["merge-base", "--is-ancestor", ref, upstream || "HEAD"], options).then(() => true, () => false);
  }

  /** Runs a branch write on the repository queue after checking for index.lock. */
  private branchWrite<T>(options: GitReadOptions, write: (gitDir: string) => Promise<T>) {
    return this.enqueue(options, async (gitDir, commit) => {
      await this.inspect(gitDir, options);
      commit();
      return write(gitDir);
    });
  }

  /** Rejects with `nothing` unless `branch` (when given) is still checked out. */
  private async requireBranch(branch: string | undefined, nothing: string, options: GitReadOptions) {
    if (branch !== undefined && (await this.git(["symbolic-ref", "-q", "--short", "HEAD"], options, 5_000, undefined, [0, 1])).trim() !== branch) {
      throw new Error(`“${branch}” is no longer the current branch. ${nothing}`);
    }
  }

  /**
   * Runs `args` (a rebase, cherry-pick or revert) as part of a queued write with `true` as the editor. Resolves "stopped" when Git
   * failed and left `kind` in progress where none was before (conflicts, or a hook refused the commit); else rejects with Git's message.
   */
  private async runOperation(gitDir: string, kind: GitOperationKind, args: readonly string[], options: GitReadOptions) {
    const before = await this.readOperation(gitDir, options);
    try {
      // Once started, the operation isn't cancelled halfway.
      await this.git(args, { processEnv: { GIT_EDITOR: "true" } }, 600_000);
      return "done" as const;
    } catch (error) {
      if (error instanceof GitServiceError && error.code === "command-failed" && !before && (await this.readOperation(gitDir, {}))?.kind === kind) return "stopped" as const;
      throw error;
    }
  }

  private head(options: GitReadOptions = {}) {
    return this.git(["rev-parse", "-q", "--verify", "HEAD"], options, 5_000, undefined, [0, 1]).then(value => value.trim());
  }

  /** What rebasing the current branch onto `ref` does (see GitRebasePlan); rejects on a detached HEAD. */
  rebasePlan(ref: string, options: GitReadOptions = {}): Promise<GitRebasePlan> {
    return this.enqueue(options, async () => {
      const branch = (await this.git(["symbolic-ref", "-q", "--short", "HEAD"], options, 5_000, undefined, [0, 1])).trim();
      if (!branch) throw new Error("Check out a branch to rebase it.");
      const count = async (...args: string[]) => Number((await this.git(["rev-list", "--count", ...args], options, 30_000)).trim());
      const [commits, behind] = await Promise.all([
        count("--no-merges", "--cherry-pick", "--right-only", "--end-of-options", `${ref}...HEAD`),
        count("--end-of-options", `HEAD..${ref}`),
      ]);
      // The upstream counts only when its ref is there (not gone, fetched at least once).
      const configured = (await this.git(["for-each-ref", "--format=%(upstream)", `refs/heads/${branch}`], options, 5_000)).split("\n")[0] ?? "";
      const upstream = configured && (await this.git(["rev-parse", "-q", "--verify", "--end-of-options", `${configured}^{commit}`], options, 5_000, undefined, [0, 1])).trim() ? configured : "";
      const pushed = !!upstream && commits > 0
        && await count("--no-merges", "--end-of-options", "HEAD", `^${ref}`) > await count("--no-merges", "--end-of-options", "HEAD", `^${ref}`, `^${upstream}`);
      return { branch, commits, behind, pushed };
    });
  }

  /**
   * Rebases the current branch onto `ref` with `git rebase` (non-interactive, `--no-autostash`, `--no-update-refs`; never forces)
   * on the repository queue after checking index.lock. With `branch`, refuses unless that branch is still checked out. Resolves
   * "stopped" when Git stopped with the rebase in progress (see operationState); rejects with Git's message, having changed
   * nothing, when Git refuses (changes in the way, another operation in progress).
   */
  rebase(ref: string, { branch, ...options }: GitReadOptions & { branch?: string } = {}): Promise<GitRebaseResult> {
    return this.branchWrite(options, async (gitDir) => {
      await this.requireBranch(branch, "Nothing was rebased.", options);
      const target = (await this.git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], options, 5_000)).trim();
      const before = await this.head();
      if (await this.runOperation(gitDir, "rebase", ["rebase", "--no-autostash", "--no-update-refs", "--end-of-options", ref], options) === "stopped") return "stopped";
      const after = await this.head();
      return after === before ? "up-to-date" : after === target ? "fast-forward" : "rebased";
    });
  }

  /**
   * Applies commit `oid` onto the current branch with `git cherry-pick`. A pick that changes nothing (the branch has the change
   * already, or the commit is empty) is skipped and resolves "empty". Refuses merge commits before running. Otherwise as `rebase`.
   */
  cherryPick(oid: string, { branch, ...options }: GitReadOptions & { branch?: string } = {}): Promise<GitPickResult> {
    return this.pick("cherry-pick", oid, branch, options);
  }

  /**
   * Commits the reverse of commit `oid` on the current branch with `git revert --no-edit`. Refuses merge commits before running;
   * a revert with nothing to undo rejects with Git's message (never "empty"). Otherwise as `rebase`.
   */
  revert(oid: string, { branch, ...options }: GitReadOptions & { branch?: string } = {}): Promise<GitPickResult> {
    return this.pick("revert", oid, branch, options);
  }

  private pick(kind: "cherry-pick" | "revert", oid: string, branch: string | undefined, options: GitReadOptions) {
    return this.branchWrite(options, async (gitDir) => {
      const verb = kind === "revert" ? "Reverting" : "Cherry-picking";
      await this.requireBranch(branch, `Nothing was ${kind === "revert" ? "reverted" : "cherry-picked"}.`, options);
      const [commit, ...parents] = (await this.git(["rev-list", "--parents", "-n", "1", "--end-of-options", `${oid}^{commit}`], options, 5_000)).trim().split(" ");
      if (parents.length > 1) throw new Error(`${verb} a merge commit isn’t supported yet.`);
      const before = await this.head();
      const args = kind === "revert" ? ["revert", "--no-edit"] : ["cherry-pick"];
      if (await this.runOperation(gitDir, kind, [...args, "--end-of-options", commit!], options) === "stopped") {
        // Git stops a pick that leaves nothing to commit too: no conflicts and an index matching HEAD. It is skipped.
        const unchanged = kind === "cherry-pick" && !(await this.git(["ls-files", "-u", "-z"], {}, 10_000)).length
          && await this.git(["diff", "--cached", "--quiet", "HEAD", "--"], {}, 30_000).then(() => true, () => false);
        if (!unchanged) return "stopped";
        await this.git(["cherry-pick", "--skip"], { processEnv: { GIT_EDITOR: "true" } }, 60_000);
        return "empty";
      }
      return await this.head() === before ? "empty" : "committed";
    });
  }

  /**
   * Switches to local branch `name`, or to remote branch `remote` as a local branch tracking it (the existing local
   * branch of that name when there is one), inside a queued write. Returns the local branch's name. When Git refuses
   * and the target exists while the worktree has changes, rejects with GitLocalChangesError.
   */
  private async switchTo(target: string | GitRemoteBranch, options: GitReadOptions) {
    const local = typeof target === "string" ? target : target.branch;
    const exists = async (ref: string) => !!(await this.git(["rev-parse", "--verify", "-q", "--end-of-options", `${ref}^{commit}`], options, 5_000, undefined, [0, 1])).trim();
    const tracking = typeof target !== "string" && !await exists(`refs/heads/${local}`);
    try {
      await this.git(tracking ? ["switch", "--no-guess", "--track", "-c", local, "--end-of-options", target.ref] : ["switch", "--no-guess", "--end-of-options", local], options, 120_000);
    } catch (error) {
      // Git's message may be translated, so the cause is read from the repository: the target is there, not checked out in
      // another worktree, there are no conflicts, and the worktree isn't clean.
      if (error instanceof GitServiceError && error.code === "command-failed" && await exists(tracking ? target.ref : `refs/heads/${local}`)
        && !(await this.git(["worktree", "list", "--porcelain", "-z"], options)).split("\0").includes(`branch refs/heads/${local}`)
        && !(await this.git(["ls-files", "-u", "-z"], options)).length
        && (await this.git(["status", "--porcelain", "-z", "--untracked-files=normal"], options)).length) throw new GitLocalChangesError(local, error.message);
      throw error;
    }
    return local;
  }

  /**
   * Checks out local branch `name` with `git switch`, which carries uncommitted changes along and refuses,
   * changing nothing, when they would be overwritten (GitLocalChangesError). Never forces.
   */
  async checkoutBranch(name: string, options: GitReadOptions = {}) {
    await this.validateBranchName(name, options);
    await this.branchWrite(options, () => this.switchTo(name, options));
  }

  /**
   * Checks out remote branch `remoteBranch` ("origin/feature") as a local branch tracking it, named after the
   * remote's branch. When that local branch exists already, it is checked out instead. Returns the local name.
   */
  async checkoutRemoteBranch(remoteBranch: GitRemoteBranch, options: GitReadOptions = {}) {
    await this.validateBranchName(remoteBranch.branch, options);
    return this.branchWrite(options, () => this.switchTo(remoteBranch, options));
  }

  /**
   * Creates branch `name` at `startPoint` (HEAD when omitted) and checks it out with `git switch -c`; when
   * uncommitted changes would be overwritten nothing is created.
   */
  async createBranch(name: string, startPoint?: string, options: GitReadOptions = {}) {
    await this.validateBranchName(name, options);
    return this.branchWrite(options, () => this.git(["switch", "--no-guess", "-c", name, ...startPoint ? ["--end-of-options", startPoint] : []], options, 120_000));
  }

  /** Renames local branch `from` to `to` (`git branch -m`), which refuses when `to` exists. */
  async renameBranch(from: string, to: string, options: GitReadOptions = {}) {
    await this.validateBranchName(to, options);
    return this.branchWrite(options, () => this.git(["branch", "-m", "--end-of-options", from, to], options));
  }

  /**
   * What merging `ref` into HEAD does: nothing (HEAD has its commits), fast-forward HEAD to it, or make a merge commit
   * (also when `merge.ff` is false). Unrelated histories count as a merge (Git refuses it).
   */
  mergeKind(ref: string, options: GitReadOptions = {}): Promise<Exclude<GitMergeResult, "stopped">> {
    return this.enqueue(options, async () => {
      const [ours = 0, theirs = 0] = (await this.git(["rev-list", "--left-right", "--count", "--end-of-options", `HEAD...${ref}`], options, 30_000)).trim().split(/\s+/).map(Number);
      const fastForward = (await this.git(["config", "--get", "merge.ff"], options, 5_000, undefined, [0, 1])).trim() !== "false";
      return !theirs ? "up-to-date" : !ours && fastForward ? "fast-forward" : "merge";
    });
  }

  /**
   * Merges `ref` (a full ref name or a commit) into the current branch with `git merge --no-edit` on the repository queue
   * after checking index.lock: fast-forwards when it can, else commits with Git's default message. Hooks and the user's merge configuration apply;
   * never forces or stashes (`--no-autostash`). With `branch`, refuses unless that branch is still checked out. Resolves "stopped" when Git stopped with the merge in progress (conflicts, or a hook refused
   * the commit; see operationState). Rejects with Git's message, having changed nothing, when Git refuses (changes in the
   * way, unrelated histories, another operation in progress).
   */
  merge(ref: string, { branch, ...options }: GitReadOptions & { branch?: string } = {}): Promise<GitMergeResult> {
    return this.branchWrite(options, async () => {
      await this.requireBranch(branch, "Nothing was merged.", options);
      const target = (await this.git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], options, 5_000)).trim();
      // Once started, the merge isn't cancelled halfway.
      const before = await this.head();
      // Git's message names what it was given ("Merge branch 'feature'"), so a full ref name is shortened when that is unambiguous.
      const short = ref.replace(/^refs\/(heads|remotes)\//, "");
      const name = short !== ref && !short.startsWith("-") && (await this.git(["rev-parse", "--symbolic-full-name", short], {}, 5_000, undefined, [0, 128])).trim() === ref ? short : ref;
      const mergeHead = () => this.git(["rev-parse", "-q", "--verify", "MERGE_HEAD"], {}, 5_000, undefined, [0, 1]).then(value => !!value.trim());
      const merging = await mergeHead();
      try {
        await this.git(["merge", "--no-edit", "--no-autostash", "--end-of-options", name], { processEnv: { GIT_EDITOR: "true" } }, 600_000);
      } catch (error) {
        if (error instanceof GitServiceError && error.code === "command-failed" && !merging && await mergeHead()) return "stopped";
        throw error;
      }
      const after = await this.head();
      return after === before ? "up-to-date" : after === target ? "fast-forward" : "merge";
    });
  }

  /** The merge message Git prepared (MERGE_MSG) without its comment lines, or null when there is none. */
  mergeMessage(options: GitReadOptions = {}) {
    return this.enqueue(options, async (gitDir) => {
      const text = await this.process("sh", ["-c", 'cat "$1/MERGE_MSG" 2>/dev/null || true', "legend-git-merge-message", gitDir], options);
      return text.split("\n").filter(line => !line.startsWith("#")).join("\n").trim() || null;
    });
  }

  /** Whether worktree file `path` still has a conflict marker line (`<<<<<<< ` or `>>>>>>> `); false when the file is gone. */
  hasConflictMarkers(path: string, options: GitReadOptions = {}) {
    if (!isRepoPath(path)) return Promise.reject(new Error("Expected a repository-relative file path."));
    return this.enqueue(options, async () => {
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const found = await this.process("sh", ["-c", 'grep -qE "^(<<<<<<<|>>>>>>>)( |$)" -- "$1" 2>/dev/null && echo yes || true', "legend-git-markers", `${root}/${path}`], options);
      return found.trim() === "yes";
    });
  }

  /**
   * What a conflict pick can do with conflicted `path`, or null when it isn't conflicted (see GitConflictFile).
   */
  conflictFile(path: string, options: GitReadOptions = {}): Promise<GitConflictFile | null> {
    if (!isRepoPath(path)) return Promise.reject(new Error("Expected a repository-relative file path."));
    return this.enqueue(options, async () => {
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const stages = await this.conflictStages(root, path, options);
      return stages && this.readConflict(root, path, stages, options);
    });
  }

  /** Index stages 1–3 (base, ours, theirs) of conflicted `path`, or null when it has none. */
  private async conflictStages(root: string, path: string, options: GitReadOptions) {
    const records = (await this.git(["-C", root, "--literal-pathspecs", "ls-files", "-u", "-z", "--", path], options, 10_000)).split("\0").filter(Boolean);
    const stages = new Map<number, { mode: string; oid: string }>();
    for (const record of records) {
      const tab = record.indexOf("\t");
      const [mode, oid, stage] = record.slice(0, tab).split(" ");
      if (record.slice(tab + 1) === path) stages.set(Number(stage), { mode: mode!, oid: oid! });
    }
    return stages.size ? stages : null;
  }

  /** Whether ours and theirs can't be combined line by line: binary, a link or a submodule. */
  private async binaryConflict(stages: Map<number, { mode: string; oid: string }>, options: GitReadOptions) {
    const ours = stages.get(2), theirs = stages.get(3);
    if (!ours || !theirs) return false;
    const regular = (mode: string) => mode === "100644" || mode === "100755";
    // Git's own test for a binary pair: numstat prints "-" for both counts.
    return !regular(ours.mode) || !regular(theirs.mode)
      || (await this.git(["diff", "--numstat", "--no-ext-diff", "--no-textconv", ours.oid, theirs.oid], options, 10_000)).startsWith("-\t-\t");
  }

  private async readConflict(root: string, path: string, stages: Map<number, { mode: string; oid: string }>, options: GitReadOptions): Promise<GitConflictFile> {
    const ours = stages.get(2), theirs = stages.get(3);
    const file = (await this.process("sh", ["-c", conflictProbe, "legend-git-conflict", `${root}/${path}`], options)).trim();
    const edited = /^[0-9a-f]{40,64}$/.test(file) && file !== ours?.oid && file !== theirs?.oid;
    return { ours: !!ours, theirs: !!theirs, binary: await this.binaryConflict(stages, options), edited };
  }

  /**
   * Conflicted `path`'s worktree text and its conflict regions (see parseConflictRegions), or null when it isn't conflicted,
   * is gone, isn't a regular file, or isn't UTF-8 text.
   */
  conflictRegions(path: string, options: GitReadOptions = {}): Promise<GitConflictRegions | null> {
    if (!isRepoPath(path)) return Promise.reject(new Error("Expected a repository-relative file path."));
    return this.enqueue(options, async () => {
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const text = await this.conflictText(root, path, options);
      if (text === null) return null;
      const size = await this.markerSize(root, path, options);
      return { text, size, regions: parseConflictRegions(text, size) };
    });
  }

  /** The length of `path`'s conflict markers: its conflict-marker-size attribute, else Git's 7. */
  private async markerSize(root: string, path: string, options: GitReadOptions) {
    const [, , value = ""] = (await this.git(["-C", root, "--literal-pathspecs", "check-attr", "-z", "conflict-marker-size", "--", path], options, 10_000)).split("\0");
    return /^[1-9][0-9]*$/.test(value) ? Number(value) : 7;
  }

  private async conflictText(root: string, path: string, options: GitReadOptions) {
    if (!await this.conflictStages(root, path, options)) return null;
    const text = await this.process("sh", ["-c", 'if test -f "$1" && ! test -L "$1"; then printf x && cat -- "$1"; fi', "legend-git-conflict-text", `${root}/${path}`], options, 10_000);
    // Bytes that aren't UTF-8 decode to U+FFFD and wouldn't be written back as they were.
    return text.startsWith("x") && !/[\0\uFFFD]/.test(text) ? text.slice(1) : null;
  }

  /**
   * Replaces conflict region `index` of conflicted `path` with ours, theirs or both in the worktree file only (it stays
   * conflicted until staged). `shown` is the text the regions were read from: when the file differs from it, rejects
   * without writing, since the region may have moved.
   */
  resolveConflictRegion(path: string, index: number, side: ConflictRegionSide, shown: string, options: GitReadOptions = {}) {
    return this.rewriteConflictText(path, shown, "its conflicts were shown, so nothing was picked. Review them again.",
      (text, size) => resolveConflictRegion(text, index, side, size), options);
  }

  /**
   * Writes `text` (a hand-edited result, written byte for byte) over conflicted `path` in the worktree only; it stays
   * conflicted until staged. Rejects without writing when the file no longer matches `shown`, the text the edit began from.
   */
  saveConflictResult(path: string, text: string, shown: string, options: GitReadOptions = {}) {
    return this.rewriteConflictText(path, shown, "you began editing it, so your edits weren’t saved. Revert to see it.", () => text, options);
  }

  private rewriteConflictText(path: string, shown: string, staleReason: string, next: (text: string, size: number) => string, options: GitReadOptions) {
    if (!isRepoPath(path)) return Promise.reject(new Error("Expected a repository-relative file path."));
    return this.enqueue(options, async (_gitDir, commit) => {
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const name = `“${path.split("/").pop()}”`;
      const text = await this.conflictText(root, path, options);
      if (text === null) throw new Error(`${name} is no longer a conflicted text file. Refresh and try again.`);
      if (text !== shown) throw new Error(`${name} changed since ${staleReason}`);
      const written = next(text, await this.markerSize(root, path, options));
      commit();
      // Written in full beside the file first, then copied over it (keeping its mode and links); not cancellable once begun.
      await this.process("sh", ["-c", 't=$(mktemp "$1.XXXXXX") || exit 1; if cat > "$t"; then cat -- "$t" > "$1"; s=$?; else s=1; fi; rm -f -- "$t"; exit $s',
        "legend-git-conflict-write", `${root}/${path}`], { ...options, signal: undefined }, 60_000, written);
    });
  }

  /**
   * Resolves conflicted `path` and stages the result: "ours" or "theirs" stages that side's version from the index and writes
   * it to the worktree (what `git checkout --ours`/`--theirs` then `git add` mean, keeping that side's mode and blob exactly),
   * or deletes the file when that side deleted it (`git rm`); "both" keeps each conflicting region's ours lines, then its
   * theirs lines, with no markers (`git merge-file --union` on the index stages). Rejects, changing nothing, when the path is
   * no longer conflicted, or "both" is asked of a file a side deleted, binary, a link or a submodule.
   */
  resolveConflict(path: string, side: GitConflictSide, options: GitReadOptions = {}) {
    if (!isRepoPath(path)) return Promise.reject(new Error("Expected a repository-relative file path."));
    return this.enqueue(options, async (gitDir, commit) => {
      await this.inspect(gitDir, options);
      const root = (await this.git(["rev-parse", "--show-toplevel"], options)).replace(/\n$/, "");
      const stages = await this.conflictStages(root, path, options);
      const name = `“${path.split("/").pop()}”`;
      if (!stages) throw new Error(`${name} is no longer conflicted. Refresh and try again.`);
      const ours = stages.get(2), theirs = stages.get(3);
      let mode: string, oid: string;
      if (side === "both") {
        if (!ours || !theirs) throw new Error(`${name} was deleted on one side, so there are no two versions to combine. Keep or delete it.`);
        if (await this.binaryConflict(stages, options)) throw new Error(`${name} isn’t a text file, so its two versions can’t be combined. Use one of them.`);
        commit();
        mode = ours.mode;
        oid = (await this.process("sh", ["-c", unionMerge, "legend-git-union", ours.oid, stages.get(1)?.oid ?? "", theirs.oid], options)).trim();
      } else {
        const picked = side === "ours" ? ours : theirs;
        commit();
        if (!picked) {
          await this.git(["-C", root, "--literal-pathspecs", "rm", "-q", "--", path], options);
          return;
        }
        ({ mode, oid } = picked);
      }
      // A stage-0 entry replaces the conflict's stages; checkout-index writes it with the user's smudge filters.
      await this.git(["-C", root, "update-index", "--cacheinfo", `${mode},${oid},${path}`], options);
      if (mode !== "160000") await this.git(["-C", root, "checkout-index", "-f", "--", path], options);
    });
  }

  /**
   * Deletes local branch `name`. Without `force` it runs `git branch -d` and rejects with
   * GitBranchNotMergedError when the branch has unmerged commits; `force` runs `git branch -D`.
   */
  deleteBranch(name: string, { force = false, ...options }: GitReadOptions & { force?: boolean } = {}) {
    return this.branchWrite(options, async () => {
      const tip = (await this.git(["rev-parse", "-q", "--verify", `refs/heads/${name}^{commit}`], options, 5_000, undefined, [0, 1])).trim();
      const head = (await this.headEntry(options))?.key ?? "";
      // Its upstream and other settings, which Git removes with it.
      const config = Object.fromEntries((await this.git(["config", "-z", "--get-regexp", `^branch\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`], options, 5_000, undefined, [0, 1])).split("\0").filter(Boolean)
        .map(entry => { const newline = entry.indexOf("\n"); return [entry.slice(`branch.${name}.`.length, newline), entry.slice(newline + 1)]; }));
      try {
        await this.git(["branch", force ? "-D" : "-d", "--end-of-options", name], options);
      } catch (error) {
        if (!force && error instanceof GitServiceError && !await this.branchMerged(name, options)) throw new GitBranchNotMergedError(name, error.message);
        throw error;
      }
      // Git drops a deleted branch's reflog, so Undo reads a record commit instead: the tip (kept reachable as its first
      // parent), HEAD's reflog entry at the time and the previous record.
      if (tip) await this.recordDeletedBranch(name, tip, head, config).catch(() => {});
    });
  }

  /** HEAD's newest reflog entry as "<oid> <time> <message>", or "" when it has none. */
  private async headEntry(options: GitReadOptions, skip = 0) {
    const [oid = "", selector = "", subject = ""] = (await this.git(["log", "-g", "-1", `--skip=${skip}`, "--date=unix", "--format=%H%x00%gd%x00%gs", "HEAD", "--"], options, 10_000, undefined, [0, 128])).replace(/\n$/, "").split("\0");
    const time = /@\{(\d+)\}$/.exec(selector)?.[1] ?? "";
    return oid ? { oid, subject, key: `${oid} ${time} ${subject}` } : null;
  }

  private async commitSubject(oid: string, options: GitReadOptions): Promise<GitUndoCommit> {
    const subject = (await this.git(["log", "-1", "--format=%s", "--end-of-options", oid, "--"], options, 10_000, undefined, [0, 128])).replace(/\n$/, "");
    return { oid, subject };
  }

  /** The newest record of a branch Legend Git deleted: the branch, its tip, HEAD's reflog entry when it was deleted, and the record before it. */
  private async deletedBranch(options: GitReadOptions) {
    const record = (await this.git(["rev-parse", "-q", "--verify", `${deletedBranchesRef}^{commit}`], options, 5_000, undefined, [0, 1])).trim();
    if (!record) return null;
    const [parents = "", body = ""] = (await this.git(["log", "-1", "--format=%P%x00%B", record, "--"], options, 10_000)).split("\0");
    const [tip, previous] = parents.trim().split(" ");
    if (!body.startsWith(`${deletedBranchMarker}\n\n`) || !tip) return null;
    try {
      const { branch, head, config = {} } = JSON.parse(body.slice(deletedBranchMarker.length + 2)) as { branch: string; head: string; config?: Record<string, string> };
      return { record, branch, head, config, tip, previous: previous ?? null };
    } catch { return null; }
  }

  /**
   * Paths the move from HEAD to `to` changes that have changes of their own (staged, unstaged, untracked or ignored).
   * `safe` ones already hold exactly what `to` has, so nothing is lost when they are overwritten; the rest are `unsafe`.
   */
  private async overwritten(to: string, options: GitReadOptions) {
    const moved = (await this.git(["diff", "--name-only", "--no-renames", "-z", to, "HEAD", "--"], options)).split("\0").filter(Boolean);
    if (!moved.length) return { safe: [], unsafe: [] };
    // Ignored folders are listed as "dir/"; a path under one counts as changed.
    const dirty = (await this.git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all", "--ignored=matching"], options)).split("\0").filter(Boolean).map(record => record.slice(3));
    const paths = moved.filter(path => dirty.some(entry => entry === path || entry.endsWith("/") && path.startsWith(entry)));
    if (!paths.length) return { safe: [], unsafe: [] };
    const target = new Map((await this.git(["--literal-pathspecs", "ls-tree", "-z", "--full-tree", to, "--", ...paths], options)).split("\0").filter(Boolean).map(record => {
      const [meta = "", path = ""] = record.split("\t");
      const [mode, , oid] = meta.split(" ");
      return [path, mode === "120000" || mode === "160000" ? "x" : oid!];
    }));
    const current = (await this.process("sh", ["-c", worktreeBlobs, "legend-git-blobs", ...paths], options)).split("\0");
    const safe: string[] = [], unsafe: string[] = [];
    paths.forEach((path, index) => {
      const blob = current[index], wanted = target.get(path) ?? "-";
      (blob !== "x" && blob === wanted ? safe : unsafe).push(path);
    });
    return { safe, unsafe };
  }

  /** The remote branch containing `oid` among the branch's upstream and same-named remote branches, or null. */
  private async pushedTo(branch: string, oid: string, options: GitReadOptions) {
    const upstream = (await this.git(["for-each-ref", "--format=%(upstream)", `refs/heads/${branch}`], options, 5_000)).trim();
    const candidates = (await this.git(["for-each-ref", "--format=%(refname)", "refs/remotes"], options, 10_000)).split("\n")
      .filter(ref => ref && (ref === upstream || ref.endsWith(`/${branch}`)) && !ref.endsWith("/HEAD"));
    for (const ref of candidates) {
      // Exit 1: not an ancestor.
      if (await this.git(["merge-base", "--is-ancestor", oid, ref], options, 10_000).then(() => true, () => false)) return ref.slice("refs/remotes/".length);
    }
    return null;
  }

  /** A merge's reflog names what was merged as typed: "@{u}" (Pull) becomes the upstream's name, a commit id a branch's when one points there. */
  private async mergedName(name: string, branch: string | null, options: GitReadOptions) {
    if (/^@\{(u|upstream)\}$/.test(name) && branch) {
      return (await this.git(["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branch}`], options, 5_000)).trim() || name;
    }
    return /^[0-9a-f]{7,64}$/.test(name) ? await this.nameCommit(name, options) ?? name.slice(0, 7) : name;
  }

  private async readUndo(gitDir: string, options: GitReadOptions): Promise<GitUndo | null> {
    const state = await this.inspect(gitDir, options);
    if (await this.unborn(options)) return null;
    const latest = await this.headEntry(options);
    const deleted = await this.deletedBranch(options);
    // A branch made again under the deleted one's name hides that deletion, and Undo goes on to HEAD's operation.
    if (deleted && deleted.head === (latest?.key ?? "") && !(await this.git(["rev-parse", "-q", "--verify", `refs/heads/${deleted.branch}`], options, 5_000, undefined, [0, 1])).trim()) {
      return {
        kind: "branch-delete", branch: deleted.branch, from: null, to: await this.commitSubject(deleted.tip, options), toBranch: null, name: null, keepsChanges: true, refusal: null, entry: deleted.record,
      };
    }
    if (!latest || latest.subject.startsWith(undoReflogAction)) return null;
    const head = await this.head(options);
    if (head !== latest.oid) return null;
    const { subject } = latest;
    const previous = await this.headEntry(options, 1);
    let kind: GitUndoKind | null = null, name: string | null = null, to = previous?.oid ?? "", toBranch: string | null = null;
    let match: RegExpExecArray | null;
    if (/^commit: /.test(subject)) kind = "commit";
    else if (/^commit \(amend\): /.test(subject)) kind = "amend";
    else if (/^commit \(merge\): /.test(subject)) kind = "merge";
    else if ((match = /^merge (.+?): /.exec(subject))) { kind = "merge"; name = await this.mergedName(match[1]!, state.branch, options); }
    else if (/^cherry-pick: /.test(subject) || /^commit \(cherry-pick\): /.test(subject)) kind = "cherry-pick";
    else if (/^revert: /.test(subject) || /^commit \(revert\): /.test(subject)) kind = "revert";
    else if (/^reset: moving to /.test(subject)) kind = "reset";
    else if ((match = /^rebase(?: -[im])? \(finish\): returning to refs\/heads\/(.+)$/.exec(subject))) {
      // The branch's own reflog has one entry for the whole rebase; the one before it is the tip before the rebase.
      const branch = match[1]!;
      if (branch !== state.branch) return null;
      const lines = (await this.git(["log", "-g", "-2", "--format=%H%x00%gs", `refs/heads/${branch}`, "--"], options, 10_000, undefined, [0, 128])).split("\n").filter(Boolean).map(line => line.split("\0"));
      if (lines.length < 2 || lines[0]![0] !== head || !/^rebase(?: -[im])? \(finish\): /.test(lines[0]![1] ?? "")) return null;
      kind = "rebase"; to = lines[1]![0]!;
      name = /onto ([0-9a-f]+)$/.exec(lines[0]![1]!)?.[1] ?? null;
      if (name) name = await this.nameCommit(name, options);
    } else if ((match = /^checkout: moving from (.+) to (.+)$/.exec(subject))) {
      const [, fromName, toName] = match;
      if (fromName === toName) return null;
      kind = "checkout";
      // A branch that is still there is checked out again; otherwise HEAD goes back to the commit, detached.
      const branchOid = (await this.git(["rev-parse", "-q", "--verify", `refs/heads/${fromName}^{commit}`], options, 5_000, undefined, [0, 1])).trim();
      if (branchOid && fromName !== state.branch) { toBranch = fromName!; to = branchOid; }
      name = toName!;
    }
    if (!kind || !to || to === head && kind !== "checkout") return null;
    const keepsChanges = kind === "commit" || kind === "amend";
    const plan: GitUndo = {
      kind, branch: state.branch, from: await this.commitSubject(head, options), to: await this.commitSubject(to, options), toBranch, name, keepsChanges, refusal: null, entry: latest.key,
    };
    const operation = await this.readOperation(gitDir, options);
    if (operation) { plan.refusal = `A ${operation.kind} is in progress. Continue or abort it first.`; return plan; }
    // A fast-forward (Pull is one) made no commit of its own, so moving back never needs a force push.
    if (kind !== "checkout" && kind !== "reset" && state.branch && !/: Fast-forward$/.test(subject)) {
      const pushed = await this.pushedTo(state.branch, head, options);
      if (pushed) { plan.refusal = `“${state.branch}” was already pushed to “${pushed}” with this ${kind === "amend" ? "amended commit" : kind}. Undoing it here would leave the remote ahead and need a force push, so Legend Git doesn’t undo it.`; return plan; }
    }
    if (!keepsChanges) {
      const paths = (await this.overwritten(to, options)).unsafe;
      if (paths.length) {
        const list = paths.length === 1 ? `“${paths[0]}” has changes` : `${paths.length} files have changes, including “${paths[0]}”,`;
        plan.refusal = `${list} that undoing would overwrite. Commit, stash or discard them first.`;
      }
    }
    return plan;
  }

  /**
   * The newest operation in HEAD's reflog (or the newest branch Legend Git deleted, when that came after it) that Edit ▸ Undo
   * can take back, or null. Reflog entries written by an undo are never undone (there is no redo).
   */
  undoPlan(options: GitReadOptions = {}) {
    return this.enqueue(options, gitDir => this.readUndo(gitDir, options));
  }

  /**
   * Undoes `plan` (from undoPlan) as a queued write, after reading it again: rejects, changing nothing, when the newest
   * operation is no longer the same one or the plan is now refused. Commit and amend move the branch back with
   * `git reset --soft` (their changes stay staged); merge, rebase, cherry-pick, revert and reset with `git reset --keep`;
   * a checkout switches back; a deleted branch is created again at its tip.
   */
  undo(plan: GitUndo, options: GitReadOptions = {}) {
    return this.enqueue(options, async (gitDir, commit) => {
      const current = await this.readUndo(gitDir, options);
      if (!current || current.entry !== plan.entry || current.kind !== plan.kind || current.to.oid !== plan.to.oid) throw new Error("The repository changed since this undo was offered. Look at the new state, then try again.");
      if (current.refusal) throw new Error(current.refusal);
      commit();
      const env = { processEnv: { GIT_REFLOG_ACTION: undoReflogAction } };
      if (current.kind === "branch-delete") {
        await this.git(["branch", "--end-of-options", current.branch!, current.to.oid], options);
        const deleted = await this.deletedBranch(options);
        for (const [key, value] of Object.entries(deleted?.config ?? {})) await this.git(["config", `branch.${current.branch}.${key}`, value], {}).catch(() => {});
        if (deleted?.previous) await this.git(["update-ref", "-m", `${undoReflogAction}: restored ${current.branch}`, deletedBranchesRef, deleted.previous, deleted.record], {});
        else await this.git(["update-ref", "-d", deletedBranchesRef, current.entry], {});
      } else if (current.kind === "checkout") {
        await this.git(current.toBranch ? ["switch", "--no-guess", "--end-of-options", current.toBranch] : ["switch", "--detach", "--end-of-options", current.to.oid], env, 120_000);
      } else {
        if (!current.keepsChanges) {
          // Changed files that already hold what `to` has (the usual soft or mixed reset) go back to HEAD's version first, so
          // `reset --keep` takes them; it then writes the same content again.
          const { safe } = await this.overwritten(current.to.oid, {});
          const inHead = new Set((await this.git(["--literal-pathspecs", "ls-tree", "-z", "--name-only", "--full-tree", "HEAD", "--", ...safe], {})).split("\0").filter(Boolean));
          const tracked = safe.filter(path => inHead.has(path)), added = safe.filter(path => !inHead.has(path));
          if (tracked.length) await this.git(["--literal-pathspecs", "checkout", "-q", "HEAD", "--", ...tracked], {});
          if (added.length) await this.git(["--literal-pathspecs", "rm", "-q", "-f", "-r", "--ignore-unmatch", "--cached", "--", ...added], {});
          if (added.length) await this.process("sh", ["-c", 'for p do rm -f -- "./$p" || exit 1; done', "legend-git-remove", ...added], {});
        }
        await this.git(["reset", "-q", current.keepsChanges ? "--soft" : "--keep", "--end-of-options", current.to.oid], env, 120_000);
      }
    });
  }

  /** Records a deleted branch; earlier records that a newer HEAD operation hides are dropped, so their commits can be pruned. */
  private async recordDeletedBranch(branch: string, tip: string, head: string, config: Record<string, string>) {
    const old = (await this.git(["rev-parse", "-q", "--verify", `${deletedBranchesRef}^{commit}`], {}, 5_000, undefined, [0, 1])).trim();
    const previous = old && (await this.deletedBranch({}))?.head === head ? old : "";
    const tree = (await this.git(["mktree"], {}, 10_000, "")).trim();
    const identity = ["-c", "user.name=Legend Git", "-c", "user.email=legend-git@localhost", "-c", "commit.gpgsign=false"];
    const message = `${deletedBranchMarker}\n\n${JSON.stringify({ branch, head, config })}\n`;
    const record = (await this.git([...identity, "commit-tree", tree, "-p", tip, ...previous ? ["-p", previous] : []], {}, 10_000, message)).trim();
    await this.git(["update-ref", "-m", `legend-git: deleted ${branch}`, deletedBranchesRef, record, old || "0".repeat(record.length)], {});
  }

  /** Stash entries, newest first. */
  listStashes(options: GitReadOptions = {}) {
    return this.read(["stash", "list", "-z", "--format=%H%x00%gd%x00%gs%x00%ct"], options, 10_000).then(parseStashList);
  }

  /** The current `stash@{n}` of stash `oid`, read inside a queued operation so a newer push can't shift it. */
  private async stashSelector(oid: string, options: GitReadOptions) {
    const index = (await this.git(["stash", "list", "--format=%H"], options, 10_000)).split("\n").indexOf(oid);
    if (index < 0) throw new Error("That stash is no longer in the stash list.");
    return `stash@{${index}}`;
  }

  private async unborn(options: GitReadOptions) {
    return !(await this.git(["rev-parse", "--verify", "-q", "HEAD"], options, 5_000, undefined, [0, 1])).trim();
  }

  /** Pushes a stash (`git stash push`) and resolves with its oid; rejects when there is nothing to stash or no first commit yet. */
  private async pushStash(message: string | undefined, includeUntracked: boolean, options: GitReadOptions) {
    if (await this.unborn(options)) throw new Error("Stashing needs a first commit. Commit once, then stash.");
    const top = () => this.git(["rev-parse", "--verify", "-q", "refs/stash"], options, 5_000, undefined, [0, 1]).then(value => value.trim());
    const before = await top();
    await this.git(["stash", "push", ...includeUntracked ? ["--include-untracked"] : [], ...message ? ["--message", message] : [], "--"], options, 120_000);
    const after = await top();
    if (!after || after === before) throw new Error("There are no local changes to stash.");
    return after;
  }

  /** Stashes the uncommitted changes, and untracked files with `includeUntracked`; resolves with the new stash's oid. */
  stashPush(message?: string, { includeUntracked = false, ...options }: GitStashPushOptions = {}) {
    return this.branchWrite(options, () => this.pushStash(message?.trim() || undefined, includeUntracked, options));
  }

  /** Applies stash `oid` (`git stash apply`); on conflicts or refusal the stash stays and Git's message is the error. */
  stashApply(oid: string, options: GitReadOptions = {}) {
    return this.branchWrite(options, async () => { await this.git(["stash", "apply", await this.stashSelector(oid, options)], options, 120_000); });
  }

  /** Applies stash `oid` and drops it only when Git applied it cleanly; rejects with GitStashDropError when only the drop failed. */
  stashPop(oid: string, options: GitReadOptions = {}) {
    return this.branchWrite(options, async () => {
      await this.git(["stash", "apply", await this.stashSelector(oid, options)], options, 120_000);
      try {
        await this.git(["stash", "drop", await this.stashSelector(oid, options)], options);
      } catch (error) {
        throw new GitStashDropError(error instanceof Error ? error.message : String(error));
      }
    });
  }

  stashDrop(oid: string, options: GitReadOptions = {}) {
    return this.branchWrite(options, async () => { await this.git(["stash", "drop", await this.stashSelector(oid, options)], options); });
  }

  /**
   * Stash `oid`'s changes in `commitPatch`'s format: its worktree against its first parent (the commit it was made
   * on), then its untracked files (the third parent, when stashed with them) as added files.
   */
  stashPatch(oid: string, options: GitReadOptions = {}) {
    if (!/^[0-9a-f]{40,64}$/i.test(oid)) return Promise.reject(new Error("Expected a stash id."));
    return this.enqueue(options, async () => {
      const [commit = "", base = "", , untracked] = (await this.git(["rev-list", "--parents", "--no-walk", `${oid}^{commit}`], options)).trim().split(" ");
      const tracked = await this.git(["-c", "diff.submodule=short", ...diffFormat, "-M", base, commit, "--"], options);
      if (!untracked) return tracked;
      const empty = (await this.git(["hash-object", "-t", "tree", "--stdin"], options, 60_000, "")).trim();
      return tracked + await this.git(["-c", "diff.submodule=short", ...diffFormat, empty, untracked, "--"], options);
    });
  }

  /**
   * Stashes everything, untracked files included, as "auto-stash before switching to <branch>", then switches like
   * checkoutBranch/checkoutRemoteBranch. When the switch still fails, the stash is popped back (with its index) and the
   * switch's error rejects; nothing is lost. Resolves with the local branch name and the stash oid (null when nothing needed stashing).
   */
  async stashAndSwitch(target: string | GitRemoteBranch, options: GitReadOptions = {}) {
    const local = typeof target === "string" ? target : target.branch;
    await this.validateBranchName(local, options);
    return this.branchWrite(options, async () => {
      const stash = await this.pushStash(`auto-stash before switching to ${local}`, true, options).catch(async (error: unknown) => {
        if (error instanceof Error && error.message === "There are no local changes to stash.") return null;
        throw error;
      });
      try {
        return { branch: await this.switchTo(target, options), stash };
      } catch (error) {
        if (!stash) throw error;
        try {
          await this.git(["stash", "pop", "--index", await this.stashSelector(stash, options)], options, 120_000);
        } catch (restore) {
          throw new Error(`${error instanceof Error ? error.message : String(error)}\nYour changes are kept in the stash “auto-stash before switching to ${local}”: ${restore instanceof Error ? restore.message : String(restore)}`);
        }
        throw error;
      }
    });
  }

  /** The repository's worktrees, the main one first. */
  listWorktrees(options: GitReadOptions = {}) {
    return this.read(["worktree", "list", "--porcelain", "-z"], options, 10_000).then(parseWorktreeList);
  }

  /** Runs a worktree write on this worktree's queue and the repository's common-dir queue, after checking index.lock. */
  private worktreeWrite<T>(options: GitReadOptions, write: () => Promise<T>) {
    return this.enqueue(options, async (gitDir, commit) => {
      await this.inspect(gitDir, options);
      const commonDir = (await this.git(["rev-parse", "--path-format=absolute", "--git-common-dir"], options, 5_000)).replace(/\n$/, "");
      return serialize(commonQueues, commonDir, async () => {
        checkAborted(options.signal);
        commit();
        return write();
      });
    });
  }

  /**
   * Adds a worktree at absolute `path` (`git worktree add`, never forced): checking out existing local branch `branch`,
   * or creating `newBranch` at `startPoint`; resolves with the worktree's path as Git lists it. Git refuses a branch checked out in another worktree and a non-empty folder.
   */
  async addWorktree(path: string, { branch, newBranch, startPoint, ...options }: GitAddWorktreeOptions) {
    if (!path.startsWith("/") || path.includes("\0")) throw new Error("Expected an absolute folder path.");
    const name = newBranch ?? branch;
    if (!name) throw new Error("Choose a branch for the worktree.");
    await this.validateBranchName(name, options);
    return this.worktreeWrite(options, async () => {
      if (branch !== undefined && !(await this.git(["rev-parse", "--verify", "-q", "--end-of-options", `refs/heads/${branch}^{commit}`], options, 5_000, undefined, [0, 1])).trim()) {
        throw new Error(`There’s no local branch named “${branch}”.`);
      }
      // The short name of a local branch checks it out (a full ref would detach); its existence was checked above.
      const args = newBranch !== undefined ? ["-b", newBranch, "--", path, ...startPoint ? [startPoint] : []] : ["--", path, branch!];
      await this.git(["worktree", "add", "--no-guess-remote", ...args], options, 300_000);
      // As `git worktree list` shows it: symbolic links in `path` resolved.
      return (await this.git(["-C", path, "rev-parse", "--show-toplevel"], {}, 5_000)).replace(/\n$/, "");
    });
  }

  /**
   * Removes the linked worktree at `path` (`git worktree remove`). Git refuses a worktree with changes or a lock and
   * leaves it intact; `force` removes it anyway (twice forced, which also overrides a lock). A worktree whose folder
   * is gone is just unregistered.
   */
  removeWorktree(path: string, { force = false, ...options }: GitReadOptions & { force?: boolean } = {}) {
    if (!path.startsWith("/") || path.includes("\0")) return Promise.reject(new Error("Expected an absolute folder path."));
    return this.worktreeWrite(options, async () => {
      const lock = (await this.git(["-C", path, "rev-parse", "--path-format=absolute", "--git-path", "index.lock"], options, 5_000).catch(() => "")).replace(/\n$/, "");
      if (lock && (await this.process("sh", ["-c", "test -e \"$1\" && echo locked", "legend-git-lock", lock], options, 5_000, undefined, [0, 1])).trim()) throw new GitIndexLockedError(lock);
      await this.git(["worktree", "remove", ...force ? ["--force", "--force"] : [], "--", path], options, 300_000);
    });
  }

  /** How many paths have changes in the worktree at `path` (`git status --porcelain`, untracked folders counted once). */
  worktreeChangeCount(path: string, options: GitReadOptions = {}) {
    return this.git(["-C", path, "status", "--porcelain", "-z", "--untracked-files=normal", "--ignore-submodules=dirty"], options, 30_000).then(countStatusEntries);
  }

  /** The status of the worktree at `path`, every untracked file listed. */
  worktreeStatus(path: string, options: GitReadOptions = {}) {
    return this.git(["-C", path, "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignored=no"], options, 60_000).then(parseGitStatus);
  }

  /**
   * One changed file of the worktree at `path`, staged and unstaged together (HEAD → worktree; an unborn HEAD diffs from
   * the empty tree), or an untracked file against /dev/null, in `fileDiff`'s format.
   */
  async worktreeFileDiff(path: string, file: { path: string; untracked?: boolean }, options: GitReadOptions = {}) {
    if (!isRepoPath(file.path)) throw new Error("Expected a repository-relative file path.");
    const prefix = ["-C", path, "-c", "diff.submodule=short"];
    if (file.untracked) return this.git([...prefix, ...diffFormat, "--no-index", "--", "/dev/null", file.path], options, 60_000, undefined, [0, 1]);
    const head = (await this.git(["-C", path, "rev-parse", "--verify", "-q", "HEAD"], options, 5_000, undefined, [0, 1])).trim()
      || (await this.git(["hash-object", "-t", "tree", "--stdin"], options, 5_000, "")).trim();
    return this.git([...prefix, "--literal-pathspecs", ...diffFormat, "--no-renames", head, "--", file.path], options);
  }

  private async commonDir(options: GitReadOptions): Promise<string> {
    this.commonGitDir ??= (await this.read(["rev-parse", "--path-format=absolute", "--git-common-dir"], options, 5_000)).replace(/\n$/, "");
    return this.commonGitDir;
  }

  /**
   * Runs one network operation at a time per repository (its common dir, so worktrees share the slot), outside the
   * read/write queue so status and history keep loading meanwhile. Credentials never prompt: GIT_TERMINAL_PROMPT=0, and
   * SSH runs in batch mode unless core.sshCommand chooses the command.
   */
  private async network<T>(options: GitNetworkOptions, operation: (run: (args: readonly string[]) => Promise<string>) => Promise<T>): Promise<T> {
    const commonDir = await this.commonDir(options);
    const { signal } = options;
    let started = false;
    const pending = serialize(networkQueues, commonDir, async () => {
      checkAborted(signal);
      started = true;
      const sshCommand = (await this.git(["config", "--get", "core.sshCommand"], options, 5_000, undefined, [0, 1])).trim();
      const parse = options.onProgress && createProgressParser(options.onProgress);
      const processOptions: GitProcessOptions = {
        signal: options.signal,
        processEnv: { GIT_TERMINAL_PROMPT: "0", ...sshCommand ? {} : { GIT_SSH_COMMAND: "ssh -o BatchMode=yes" } },
        ...parse ? { onStderr: parse } : {},
      };
      return operation(args => this.git(args, processOptions, options.timeoutMs ?? networkTimeout));
    });
    if (!signal) return pending;
    // Waiting for another operation's slot ends at once on abort; once started, the operation itself handles the abort.
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => { if (!started) reject(new GitServiceError("aborted", "Git operation was cancelled.")); };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return Promise.race([pending, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
  }

  /** The remote and branch name `branch` (the current branch by default) tracks, or null without an upstream. */
  private async upstream(options: GitReadOptions, name?: string) {
    const branch = name ?? await this.currentBranch(options);
    if (!branch) return null;
    const [remote = "", merge = ""] = await Promise.all([`branch.${branch}.remote`, `branch.${branch}.merge`].map(key =>
      this.read(["config", "--get", key], options, 5_000, false, [0, 1]).then(value => value.trim())));
    return remote && merge ? { branch, remote, merge } : null;
  }

  /**
   * `git fetch --progress [--prune] <remote>`, or `--all` remotes. Only refs change; a cancelled fetch leaves the remote
   * being fetched as it was (with `--all`, remotes fetched before the cancel keep their new refs).
   */
  fetch({ remote, prune = false, ...options }: GitFetchOptions = {}) {
    if (remote !== undefined && (!remote || remote.startsWith("-"))) return Promise.reject(new Error(`“${remote}” isn’t a remote name.`));
    return this.network(options, run => run(["fetch", "--progress", ...prune ? ["--prune"] : [], ...remote ? [remote] : ["--all"]])).then(() => {});
  }

  /**
   * Fetches pull request `number`'s head (`refs/pull/<number>/head` on `remote`, as GitHub publishes it) into local
   * branch `branch`: creates it, or fast-forwards it (the checked-out branch with `merge --ff-only`). Never forces: Git
   * refuses, and its message rejects, when the branch has commits the pull request doesn't, or is checked out in
   * another worktree. Resolves with the head commit.
   */
  async fetchPullRequest(remote: string, number: number, branch: string, options: GitNetworkOptions = {}) {
    if (!remote || remote.startsWith("-")) throw new Error(`“${remote}” isn’t a remote name.`);
    if (!Number.isSafeInteger(number) || number < 1) throw new Error(`“${number}” isn’t a pull request number.`);
    await this.validateBranchName(branch, options);
    const source = `refs/pull/${number}/head`;
    return this.network(options, async run => {
      if (await this.currentBranch(options) === branch) {
        await run(["fetch", "--progress", "--no-tags", remote, source]);
        // Read at once: another fetch (an editor's, a terminal's) may rewrite FETCH_HEAD before the merge runs.
        const head = (await this.git(["rev-parse", "--verify", "FETCH_HEAD^{commit}"], {}, 5_000)).trim();
        await this.branchWrite(options, () => this.git(["merge", "--ff-only", "--no-edit", head], {}, 120_000));
      } else await run(["fetch", "--progress", "--no-tags", remote, `${source}:refs/heads/${branch}`]);
      // Not cancellable: the branch has moved by now, so the caller should go on to check it out.
      return (await this.git(["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], {}, 5_000)).trim();
    });
  }

  /**
   * Fetches the upstream's remote (cancellable), then fast-forwards the current branch to its upstream with
   * `git merge --ff-only @{u}` as a queued write (checks index.lock first; once started it finishes). Rejects with Git's
   * message when the branch can't be fast-forwarded, and with GitNoUpstreamError without an upstream.
   */
  pull(options: GitNetworkOptions = {}) {
    return this.network(options, async run => {
      await this.repoState(options);
      const upstream = await this.upstream(options);
      if (!upstream) throw new GitNoUpstreamError("The current branch has no upstream branch to pull from. Push it first, which sets one.");
      if (upstream.remote !== ".") await run(["fetch", "--progress", upstream.remote]);
      await this.branchWrite(options, async () => {
        try {
          await this.git(["merge", "--ff-only", "--no-edit", "@{u}"], {}, 120_000);
        } catch (error) {
          // Decided from the history, not Git's (possibly translated) message.
          const fastForward = await this.git(["merge-base", "--is-ancestor", "HEAD", "@{u}"], {}, 10_000).then(() => true, () => false);
          throw error instanceof GitServiceError && !fastForward ? new GitPullDivergedError(error.message) : error;
        }
      });
    });
  }

  /**
   * Pushes the current branch; see pushBranch. Rejects when HEAD is detached.
   */
  async push(options: GitPushOptions = {}) {
    const branch = await this.currentBranch(options);
    if (!branch) throw new Error("Check out a branch to push; HEAD is detached.");
    return this.pushBranch(branch, options);
  }

  /**
   * Pushes local branch `branch`, checked out or not, to its upstream (`git push --progress <remote>
   * refs/heads/<branch>:<upstream branch>`, whatever push.default says), or for a first push `git push --set-upstream
   * <remote> refs/heads/<branch>:refs/heads/<branch>`. Never forces; the remote-tracking ref follows. Rejects with
   * GitPushRejectedError when the remote has commits the branch doesn't, and GitNoUpstreamError when there is no upstream.
   */
  pushBranch(branch: string, { setUpstream, ...options }: GitPushOptions = {}) {
    if (setUpstream !== undefined && (!setUpstream || setUpstream.startsWith("-"))) return Promise.reject(new Error(`“${setUpstream}” isn’t a remote name.`));
    if (!branch || branch.startsWith("-") || /[\0\s:]/.test(branch)) return Promise.reject(new Error(`“${branch}” isn’t a branch name.`));
    return this.network(options, async run => {
      const upstream = setUpstream ? null : await this.upstream(options, branch);
      if (!setUpstream && !upstream) throw new GitNoUpstreamError(`The branch “${branch}” has no upstream branch yet. Publish it to set one.`);
      try {
        await run(["push", "--progress", ...upstream ? [upstream.remote, `refs/heads/${branch}:${upstream.merge}`] : ["--set-upstream", setUpstream!, `refs/heads/${branch}:refs/heads/${branch}`]]);
      } catch (error) {
        if (error instanceof GitServiceError && /\[rejected\].*\((?:fetch first|non-fast-forward)\)/.test(error.message)) throw new GitPushRejectedError(error.message);
        throw error;
      }
    });
  }

  /** The remote a branch's first push goes to: remote.pushDefault, else "origin", else the only remote; null when there's none to pick. */
  async publishRemote(options: GitReadOptions = {}) {
    const pushDefault = (await this.read(["config", "--get", "remote.pushDefault"], options, 5_000, false, [0, 1])).trim();
    if (pushDefault) return pushDefault;
    const remotes = (await this.remotes(options)).split("\n").filter(Boolean);
    return remotes.includes("origin") ? "origin" : remotes.length === 1 ? remotes[0]! : null;
  }

  /** The checked-out branch's short name, or null when HEAD is detached. */
  currentBranch(options: GitReadOptions = {}) {
    return this.read(["symbolic-ref", "-q", "--short", "HEAD"], options, 5_000, false, [0, 1]).then(value => value.trim() || null);
  }

  /** A config value as Git resolves it (repository, global, system), or null when unset. */
  configValue(key: string, options: GitReadOptions = {}) {
    return this.read(["config", "--get", key], options, 5_000, false, [0, 1]).then(value => value.trim() || null);
  }

  /** The fetch URL of a remote, or null when it is not configured. */
  remoteUrl(name: string, options: GitReadOptions = {}) {
    return this.read(["config", "--get", `remote.${name}.url`], options, 5_000, false, [0, 1]).then(value => value.trim() || null);
  }

  mergeBase(a: string, b: string, options: GitReadOptions = {}) {
    return this.read(["merge-base", "--", a, b], options).then((value) => value.trim());
  }

  refs(format: string, options: GitReadOptions = {}) {
    return this.read(["for-each-ref", `--format=${format}`, "refs/heads", "refs/remotes"], options, 5_000);
  }

  remotes(options: GitReadOptions = {}) {
    return this.read(["remote"], options, 5_000);
  }

  unmerged(options: GitReadOptions = {}) {
    return this.read(["ls-files", "-u", "-z"], options, 10_000);
  }
}
