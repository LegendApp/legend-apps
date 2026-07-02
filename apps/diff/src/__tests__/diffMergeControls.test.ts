import {
  areDiffMergeConflictActionsDisabled,
  diffMergeSaveConflictKey,
  getMergeConflictKey,
  isDiffMergeFileResolving,
} from "../diffMergeControls";
import type { DiffMergeConflictBlock, DiffMergeConflictFile } from "../diffMerge";

function createBlock(startLine: number): DiffMergeConflictBlock {
  return {
    endLine: startLine + 2,
    index: 0,
    oursLines: ["ours"],
    oursLineCount: 1,
    separatorLine: startLine + 1,
    startLine,
    theirsLines: ["theirs"],
    theirsLineCount: 1,
  };
}

function createFile(path: string): DiffMergeConflictFile {
  return {
    conflictRanges: [],
    displayRows: [],
    markerBlocks: [],
    path,
    stages: [],
  };
}

describe("diffMergeControls", () => {
  it("only disables merge actions for the block currently being resolved", () => {
    const currentFile = createFile("src/current.ts");
    const otherFile = createFile("src/other.ts");
    const resolvingBlock = createBlock(4);
    const otherBlock = createBlock(10);
    const resolvingKeys = new Set([getMergeConflictKey(currentFile, resolvingBlock)]);

    expect(isDiffMergeFileResolving(currentFile, resolvingKeys)).toBe(true);
    expect(areDiffMergeConflictActionsDisabled(currentFile, resolvingBlock, resolvingKeys)).toBe(true);
    expect(areDiffMergeConflictActionsDisabled(currentFile, otherBlock, resolvingKeys)).toBe(false);
    expect(isDiffMergeFileResolving(otherFile, resolvingKeys)).toBe(false);
    expect(areDiffMergeConflictActionsDisabled(otherFile, resolvingBlock, resolvingKeys)).toBe(false);
  });

  it("disables all merge actions while saving drafts", () => {
    const currentFile = createFile("src/current.ts");
    const otherFile = createFile("src/other.ts");
    const block = createBlock(4);
    const resolvingKeys = new Set([diffMergeSaveConflictKey]);

    expect(areDiffMergeConflictActionsDisabled(currentFile, block, resolvingKeys)).toBe(true);
    expect(areDiffMergeConflictActionsDisabled(otherFile, block, resolvingKeys)).toBe(true);
  });
});
