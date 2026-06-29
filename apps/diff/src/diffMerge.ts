import { commandRunner, type CommandRunner } from "@legend-desktop/command-runner";

export type DiffMergeConflictStage = {
  mode: string;
  oid: string;
  stage: number;
};

export type DiffMergeConflictBlock = {
  endLine: number;
  oursLineCount: number;
  separatorLine: number;
  startLine: number;
  theirsLineCount: number;
};

export type DiffMergeConflictFile = {
  markerBlocks: DiffMergeConflictBlock[];
  path: string;
  stages: DiffMergeConflictStage[];
};

export type DiffMergeState =
  | {
    status: "unavailable";
    reason: string;
  }
  | {
    status: "loading";
  }
  | {
    status: "ready";
    conflictBlockCount: number;
    conflictFileCount: number;
    files: DiffMergeConflictFile[];
    fileByPath: ReadonlyMap<string, DiffMergeConflictFile>;
  }
  | {
    status: "error";
    message: string;
  };

const conflictMarkerStartPattern = /^<<<<<<<(?:\s|$)/;
const conflictMarkerSeparatorPattern = /^=======$/;
const conflictMarkerEndPattern = /^>>>>>>>(?:\s|$)/;

function createReadyMergeState(files: DiffMergeConflictFile[]): DiffMergeState {
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  return {
    status: "ready",
    conflictBlockCount: files.reduce((count, file) => count + file.markerBlocks.length, 0),
    conflictFileCount: files.length,
    files,
    fileByPath,
  };
}

export function parseGitUnmergedEntries(output: string): DiffMergeConflictFile[] {
  const filesByPath = new Map<string, DiffMergeConflictFile>();
  for (const entry of output.split("\0")) {
    const match = /^(\d+)\s+([0-9a-fA-F]+)\s+([123])\t(.+)$/.exec(entry);
    if (match) {
      const [, mode, oid, stageValue, path] = match;
      let file = filesByPath.get(path);
      if (!file) {
        file = {
          markerBlocks: [],
          path,
          stages: [],
        };
        filesByPath.set(path, file);
      }
      file.stages.push({
        mode,
        oid,
        stage: Number(stageValue),
      });
    }
  }

  return [...filesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function parseConflictMarkerBlocks(content: string): DiffMergeConflictBlock[] {
  const blocks: DiffMergeConflictBlock[] = [];
  const lines = content.split(/\r\n|\n|\r/);
  let startLine: number | null = null;
  let separatorLine: number | null = null;

  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    if (conflictMarkerStartPattern.test(line)) {
      startLine = lineNumber;
      separatorLine = null;
    } else if (startLine !== null && separatorLine === null && conflictMarkerSeparatorPattern.test(line)) {
      separatorLine = lineNumber;
    } else if (startLine !== null && separatorLine !== null && conflictMarkerEndPattern.test(line)) {
      blocks.push({
        endLine: lineNumber,
        oursLineCount: Math.max(0, separatorLine - startLine - 1),
        separatorLine,
        startLine,
        theirsLineCount: Math.max(0, lineNumber - separatorLine - 1),
      });
      startLine = null;
      separatorLine = null;
    }
  });

  return blocks;
}

async function loadConflictMarkers(
  folderPath: string,
  files: DiffMergeConflictFile[],
  runner: CommandRunner,
) {
  const loadedFiles: DiffMergeConflictFile[] = [];
  for (const file of files) {
    const result = await runner.runCommand({
      args: ["--", file.path],
      command: "cat",
      cwd: folderPath,
      timeoutMs: 5_000,
    });
    loadedFiles.push({
      ...file,
      markerBlocks: result.exitCode === 0 ? parseConflictMarkerBlocks(result.stdout) : [],
    });
  }
  return loadedFiles;
}

export async function loadDiffMergeState(
  folderPath: string,
  runner: CommandRunner = commandRunner,
): Promise<DiffMergeState> {
  try {
    const unmergedResult = await runner.runCommand({
      args: ["ls-files", "-u", "-z"],
      command: "git",
      cwd: folderPath,
      timeoutMs: 10_000,
    });
    if (unmergedResult.exitCode !== 0) {
      return {
        status: "error",
        message: unmergedResult.stderr || "Unable to read Git merge conflicts.",
      };
    }

    const conflictFiles = parseGitUnmergedEntries(unmergedResult.stdout);
    if (conflictFiles.length === 0) {
      return createReadyMergeState([]);
    }

    const files = await loadConflictMarkers(folderPath, conflictFiles, runner);
    return createReadyMergeState(files);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
