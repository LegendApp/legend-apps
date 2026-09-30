import { decodeProcessText } from "@legend-apps/runtime-utils";
import type { ProcessResult } from "@legendapp/spark/processes";
import { getFilename, type DiffFilePairOpenSource } from "./diffFiles";

export type DiffFilePairSource = DiffFilePairOpenSource;

export type FilePairDiffCommand = {
  args: string[];
  target: { type: "executable"; path: string };
  timeoutMs: number;
};

const filePairDiffCommand = "/usr/bin/diff";
const filePairDiffTimeoutMs = 60_000;

function sanitizeDiffLabel(value: string) {
  const sanitized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return sanitized || "file";
}

export function getFilePairDiffDisplayPath(path: string, prefix: "a" | "b") {
  return `${prefix}/${sanitizeDiffLabel(getFilename(path))}`;
}

export function createFilePairDiffCommand(
  source: DiffFilePairSource,
  ignoreWhitespaceChanges = false,
): FilePairDiffCommand {
  const oldDisplayPath = getFilePairDiffDisplayPath(source.oldPath, "a");
  const newDisplayPath = getFilePairDiffDisplayPath(source.newPath, "b");
  return {
    args: [
      "-u",
      ...(ignoreWhitespaceChanges ? ["-w"] : []),
      "-L",
      oldDisplayPath,
      "-L",
      newDisplayPath,
      source.oldPath,
      source.newPath,
    ],
    target: { type: "executable", path: filePairDiffCommand },
    timeoutMs: filePairDiffTimeoutMs,
  };
}

function createFilePairDiffCommandError(commandResult: ProcessResult) {
  if (commandResult.timedOut) {
    return new Error("File comparison timed out. The files may be too large to compare.");
  }
  const message = decodeProcessText(commandResult.stderr)
    ? decodeProcessText(commandResult.stderr)
    : `diff exited with code ${(commandResult.exit.type === "exited" ? commandResult.exit.code : -1)}.`;
  return new Error(message);
}

export function createFilePairUnifiedDiff(source: DiffFilePairSource, commandResult: ProcessResult) {
  let diffText = "";
  if ((commandResult.exit.type === "exited" ? commandResult.exit.code : -1) === 0 && !commandResult.timedOut) {
    diffText = "";
  } else if ((commandResult.exit.type === "exited" ? commandResult.exit.code : -1) === 1 && !commandResult.timedOut) {
    const oldDisplayPath = getFilePairDiffDisplayPath(source.oldPath, "a");
    const newDisplayPath = getFilePairDiffDisplayPath(source.newPath, "b");
    diffText = `diff --git ${oldDisplayPath} ${newDisplayPath}\n${decodeProcessText(commandResult.stdout)}`;
  } else {
    throw createFilePairDiffCommandError(commandResult);
  }
  return diffText;
}
