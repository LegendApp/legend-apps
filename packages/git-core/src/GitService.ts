import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCommand, type ProcessExit, type ProcessOptions, type ProcessResult } from "@legendapp/spark/processes";
import { parseGitStatus } from "./gitStatus";

export type GitRunner = (options: ProcessOptions) => Promise<ProcessResult>;
export type GitReadOptions = { signal?: AbortSignal };
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
export type GitErrorCode = "aborted" | "index-locked" | "command-failed" | "timed-out" | "output-truncated";
/** One path's worktree state saved by a discard: its mode and blob, or `mode: null` when the path did not exist. */
export type GitBackupEntry = { path: string; mode: "100644" | "100755" | "120000"; oid: string } | { path: string; mode: null; oid?: undefined };
export type GitDiscardBackup = { ref: string; oid: string; entries: GitBackupEntry[] };
export type GitCommitInput = { message: string; amend?: boolean; signoff?: boolean };
export type GitStagedFile = { path: string; originalPath: string | null; binary: boolean; added: number; deleted: number };
/** The staged changes as `git diff --cached` text; files past the size cap are listed but left out of `patch`. */
export type GitStagedDiff = { files: GitStagedFile[]; patch: string; truncated: boolean; omitted: string[] };
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
  constructor(readonly code: GitErrorCode, message: string, readonly args: readonly string[] = []) {
    super(message);
    this.name = "GitServiceError";
  }
}

export class GitIndexLockedError extends GitServiceError {
  constructor(readonly lockPath: string) {
    super("index-locked", `Git index is locked at ${lockPath}. Wait for the other Git operation to finish, then retry.`);
    this.name = "GitIndexLockedError";
  }
}

const discoveryQueues = new Map<string, Promise<void>>();
const repoQueues = new Map<string, Promise<void>>();
const services = new Map<string, GitService>();
const stateProbe = `cat "$1/HEAD" || exit
printf '\\0'
for name in index.lock MERGE_HEAD rebase-apply rebase-merge CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
  if test -e "$1/$name"; then printf '%s\\0' "$name"; fi
done`;

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

export function getGitService(repoRoot: string) {
  const root = repoRoot.replace(/\/+$/, "") || "/";
  let service = services.get(root);
  if (!service) {
    service = new GitService(root);
    services.set(root, service);
  }
  return service;
}

export class GitService {
  private gitDir: string | undefined;
  private readonly operations: GitOperationLog[] = [];
  readonly repoRoot: string;

  constructor(repoRoot: string, private readonly runner: GitRunner = runCommand) {
    this.repoRoot = repoRoot.replace(/\/+$/, "") || "/";
  }

  getOperationLog(): readonly GitOperationLog[] {
    return this.operations.map((entry) => ({ ...entry, args: [...entry.args] }));
  }

  private enqueue<T>(options: GitReadOptions, operation: (gitDir: string) => Promise<T>): Promise<T> {
    const { signal } = options;
    const pending = serialize(discoveryQueues, this.repoRoot, async () => {
      checkAborted(signal);
      const gitDir = this.gitDir ??= (await this.git(["rev-parse", "--absolute-git-dir"], options)).replace(/\n$/, "");
      return serialize(repoQueues, gitDir, () => {
        checkAborted(signal);
        return operation(gitDir);
      });
    });
    if (!signal) return pending;
    let onAbort: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new GitServiceError("aborted", "Git operation was cancelled."));
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return Promise.race([pending, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
  }

  private async process(command: string, args: readonly string[], options: GitReadOptions, timeoutMs = 60_000, input?: string, okCodes: readonly number[] = [0]): Promise<string> {
    checkAborted(options.signal);
    const entry: GitOperationLog = { command, args: [...args], startedAt: Date.now(), endedAt: null, exit: null, stderrTail: "" };
    this.operations.push(entry);
    if (this.operations.length > 100) this.operations.shift();
    try {
      const result = await this.runner({
        target: { type: "command", name: command },
        args,
        cwd: this.repoRoot,
        env: { GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
        signal: options.signal,
        input,
        timeoutMs,
      });
      entry.exit = result.exit;
      entry.stderrTail = decodeProcessText(result.stderr).slice(-4096);
      checkAborted(options.signal);
      if (result.aborted) throw new GitServiceError("aborted", "Git operation was cancelled.", args);
      if (result.timedOut) throw new GitServiceError("timed-out", `${command} timed out.`, args);
      if (result.outputTruncated) throw new GitServiceError("output-truncated", `${command} output exceeded the capture limit.`, args);
      if (result.exit.type !== "exited" || !okCodes.includes(result.exit.code)) {
        if (/index\.lock/.test(entry.stderrTail)) throw new GitIndexLockedError(`${this.gitDir ?? `${this.repoRoot}/.git`}/index.lock`);
        throw new GitServiceError("command-failed", entry.stderrTail || `${command} failed (${result.exit.type === "exited" ? result.exit.code : "terminated"}).`, args);
      }
      return decodeProcessText(result.stdout);
    } catch (error) {
      if (!entry.stderrTail) entry.stderrTail = (error instanceof Error ? error.message : String(error)).slice(-4096);
      checkAborted(options.signal);
      throw error;
    } finally {
      entry.endedAt = Date.now();
    }
  }

  private git(args: readonly string[], options: GitReadOptions, timeoutMs = 60_000, input?: string, okCodes?: readonly number[]) {
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

  /** Applies a patch to the index only (`git apply --cached`), optionally reversed, after checking index.lock. */
  applyPatch(patch: string, options: GitReadOptions & { reverse?: boolean } = {}) {
    return this.enqueue(options, async (gitDir) => {
      await this.inspect(gitDir, options);
      await this.git(["apply", "--cached", "--whitespace=nowarn", "--no-ignore-whitespace", ...(options.reverse ? ["--reverse"] : []), "-"], options, 60_000, patch);
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
