import { type DiffMergeConflictFile, type DiffMergeState } from "../diffMerge";

export function clearDiffMergeDraftFlag(file: DiffMergeConflictFile) {
    if (!file.hasUnsavedDraft) {
        return file;
    }
    const { hasUnsavedDraft: _hasUnsavedDraft, ...savedFile } = file;
    return savedFile;
}
export function getUnsavedDiffMergeDraftFiles(mergeState: DiffMergeState) {
    return mergeState.status === "ready" ? mergeState.files.filter((file) => file.hasUnsavedDraft) : [];
}
