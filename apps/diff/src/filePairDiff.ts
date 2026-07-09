import type { CommandRunnerResult } from "@legend-apps/command-runner";
import { getFilename, type DiffFilePairOpenSource } from "./diffFiles";

export type DiffFilePairSource = DiffFilePairOpenSource;

export type FilePairDiffCommand = {
  args: string[];
  command: string;
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

export function createFilePairDiffCommand(source: DiffFilePairSource): FilePairDiffCommand {
  const oldDisplayPath = getFilePairDiffDisplayPath(source.oldPath, "a");
  const newDisplayPath = getFilePairDiffDisplayPath(source.newPath, "b");
  return {
    args: [
      "-u",
      "-L",
      oldDisplayPath,
      "-L",
      newDisplayPath,
      source.oldPath,
      source.newPath,
    ],
    command: filePairDiffCommand,
    timeoutMs: filePairDiffTimeoutMs,
  };
}

function createFilePairDiffCommandError(commandResult: CommandRunnerResult) {
  if (commandResult.timedOut) {
    return new Error("File comparison timed out. The files may be too large to compare.");
  }
  const message = commandResult.stderr
    ? commandResult.stderr
    : `diff exited with code ${commandResult.exitCode}.`;
  return new Error(message);
}

export function createFilePairUnifiedDiff(source: DiffFilePairSource, commandResult: CommandRunnerResult) {
  let diffText = "";
  if (commandResult.exitCode === 0 && !commandResult.timedOut) {
    diffText = "";
  } else if (commandResult.exitCode === 1 && !commandResult.timedOut) {
    const oldDisplayPath = getFilePairDiffDisplayPath(source.oldPath, "a");
    const newDisplayPath = getFilePairDiffDisplayPath(source.newPath, "b");
    diffText = `diff --git ${oldDisplayPath} ${newDisplayPath}\n${commandResult.stdout}`;
  } else {
    throw createFilePairDiffCommandError(commandResult);
  }
  return diffText;
}
