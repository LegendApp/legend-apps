import type { DiffMergeConflictBlock, DiffMergeConflictFile } from "./diffMerge";

export const diffMergeSaveConflictKey = "__merge-save__";

export function getMergeConflictKey(file: DiffMergeConflictFile, block: DiffMergeConflictBlock) {
  return `${file.path}:${block.startLine}`;
}

export function isDiffMergeSavePending(resolvingMergeConflictKeys: ReadonlySet<string>) {
  return resolvingMergeConflictKeys.has(diffMergeSaveConflictKey);
}

export function isDiffMergeFileResolving(
  file: DiffMergeConflictFile,
  resolvingMergeConflictKeys: ReadonlySet<string>,
) {
  const filePrefix = `${file.path}:`;
  for (const key of resolvingMergeConflictKeys) {
    if (key.startsWith(filePrefix)) {
      return true;
    }
  }
  return false;
}

export function areDiffMergeConflictActionsDisabled(
  file: DiffMergeConflictFile,
  block: DiffMergeConflictBlock | null,
  resolvingMergeConflictKeys: ReadonlySet<string>,
) {
  return isDiffMergeSavePending(resolvingMergeConflictKeys)
    || (block ? resolvingMergeConflictKeys.has(getMergeConflictKey(file, block)) : false);
}
