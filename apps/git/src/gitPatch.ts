import type { GitService, GitStatusEntry } from "@legend-apps/git-core";
import { buildUnifiedPatchSelection, findUnifiedPatchFile, parseUnifiedPatch, type UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";

export type FilePatch = { text: string; file: UnifiedPatchFile | null };

export async function loadFilePatch(git: GitService, entry: GitStatusEntry, staged: boolean, signal?: AbortSignal): Promise<FilePatch> {
  const text = await git.fileDiff({ path: entry.path, originalPath: entry.originalPath, untracked: entry.kind === "untracked" }, staged, { signal });
  return { text, file: findUnifiedPatchFile(parseUnifiedPatch(text), entry.path) };
}

/** Stages (unstaged side) or unstages (staged side) the selected changed lines of a loaded file patch. */
export function applyPatchSelection(git: GitService, file: UnifiedPatchFile, staged: boolean, selected: ReadonlySet<string>, signal?: AbortSignal) {
  const patch = buildUnifiedPatchSelection(file, selected, { reverse: staged });
  return git.applyPatch(patch, { reverse: staged, signal });
}

/** Discards the selected changed lines of a file's unstaged diff from the worktree, after Git backs the file up. */
export function discardPatchSelection(git: GitService, path: string, file: UnifiedPatchFile, selected: ReadonlySet<string>, signal?: AbortSignal) {
  return git.discardPatch(path, buildUnifiedPatchSelection(file, selected, { reverse: true }), { signal });
}
