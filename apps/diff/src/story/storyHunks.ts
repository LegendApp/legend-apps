import type { DiffDocument } from "@legend-apps/diff-parser";
import { buildStoryInput as buildSharedStoryInput, wrapStoryPath, type StoryInput } from "@legend-apps/change-story";
import type { DiffOpenSource } from "../diffFiles";
import { getStorySource } from "./storySource";

export { classifyStoryFile, storyInputContext, storyRowText, type StoryFile, type StoryHunk, type StoryInput } from "@legend-apps/change-story";

// Diff's native parser strips surrounding quotes but does not unescape paths, so they are wrapped as-is.
export function buildStoryInput(document: Pick<DiffDocument, "getFiles" | "getPlainRows">, source: DiffOpenSource): StoryInput {
  return buildSharedStoryInput(document, getStorySource(source), { quotePath: wrapStoryPath });
}
