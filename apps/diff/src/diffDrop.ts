import { stat } from "@legendapp/spark/files";
import type { DropEvent } from "@legendapp/spark/drag-drop";
import {
  createDiffFilePairSource,
  createDiffFileSource,
  isDiffFilePath,
  normalizeDiffOpenSource,
  type DiffOpenSource,
} from "./diffFiles";

export async function getDroppedDiffSource(drop: DropEvent): Promise<DiffOpenSource | null> {
  const files = drop.files ?? [];
  const entries = await Promise.all(files.map(async path => ({ path, type: (await stat(path)).type })));
  const directory = entries.find(entry => entry.type === "directory")?.path;
  let source = directory ? normalizeDiffOpenSource(directory) : null;
  if (!source && files.length === 1 && isDiffFilePath(files[0])) {
    source = createDiffFileSource(files[0]);
  }
  if (!source && files.length === 2) {
    source = createDiffFilePairSource(files[0], files[1]);
  }
  if (!source) {
    const githubUrl = (drop.urls ?? []).find((url) => normalizeDiffOpenSource(url)?.kind === "github");
    const githubSource = githubUrl ? normalizeDiffOpenSource(githubUrl) : null;
    source = githubSource?.kind === "github" ? githubSource : null;
  }
  return source;
}

export function getUnsupportedDropMessage(drop: DropEvent) {
  const files = drop.files ?? [];
  let message = "Drop a Git folder, .diff file, two files, or GitHub PR or commit URL.";
  if (files.length === 1) {
    message = "Drop a .diff or .patch file, or drop two files to compare them.";
  } else if (files.length > 2) {
    message = "Drop exactly two files to compare them.";
  } else if ((drop.urls ?? []).length > 0) {
    message = "Drop a GitHub PR or commit URL.";
  }
  return message;
}
