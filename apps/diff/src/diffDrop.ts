import type { DragDropFileEvent } from "@legend-desktop/drag-drop";
import {
  createDiffFilePairSource,
  createDiffFileSource,
  isDiffFilePath,
  normalizeDiffOpenSource,
  type DiffOpenSource,
} from "./diffFiles";

export function getDroppedDiffSource(drop: DragDropFileEvent): DiffOpenSource | null {
  const directory = drop.directories[0];
  let source = directory ? normalizeDiffOpenSource(directory) : null;
  if (!source && drop.files.length === 1 && isDiffFilePath(drop.files[0])) {
    source = createDiffFileSource(drop.files[0]);
  }
  if (!source && drop.files.length === 2) {
    source = createDiffFilePairSource(drop.files[0], drop.files[1]);
  }
  if (!source) {
    const githubUrl = drop.urls.find((url) => normalizeDiffOpenSource(url)?.kind === "github");
    const githubSource = githubUrl ? normalizeDiffOpenSource(githubUrl) : null;
    source = githubSource?.kind === "github" ? githubSource : null;
  }
  return source;
}

export function getUnsupportedDropMessage(drop: DragDropFileEvent) {
  let message = "Drop a Git folder, .diff file, two files, or GitHub PR or commit URL.";
  if (drop.files.length === 1) {
    message = "Drop a .diff or .patch file, or drop two files to compare them.";
  } else if (drop.files.length > 2) {
    message = "Drop exactly two files to compare them.";
  } else if (drop.urls.length > 0) {
    message = "Drop a GitHub PR or commit URL.";
  }
  return message;
}
