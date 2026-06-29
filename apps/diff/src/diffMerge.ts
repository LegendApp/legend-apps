import { commandRunner, type CommandRunner } from "@legend-desktop/command-runner";

export type DiffMergeConflictStage = {
  mode: string;
  oid: string;
  stage: number;
};

export type DiffMergeConflictBlock = {
  endLine: number;
  index: number;
  oursLines: string[];
  oursLineCount: number;
  separatorLine: number;
  startLine: number;
  theirsLines: string[];
  theirsLineCount: number;
};

export type DiffMergeHunkHeaderInfo = {
  hunkNumber: number;
  lineLabel: string;
};

export type DiffMergeSideChangeType = "add" | "delete" | "modify" | "none";

export type DiffMergeDisplayLine = {
  kind: "line";
  conflictBlock?: DiffMergeConflictBlock;
  conflictLineIndex?: number;
  hunkHeader?: DiffMergeHunkHeaderInfo;
  hunkIndex?: number;
  leftChangeType?: DiffMergeSideChangeType;
  leftLineNumber?: number;
  leftText: string;
  lineNumber: number;
  rightChangeType?: DiffMergeSideChangeType;
  rightLineNumber?: number;
  rightText: string;
};

export type DiffMergeDisplayRow = DiffMergeDisplayLine;

export type DiffMergeConflictRange = {
  block: DiffMergeConflictBlock;
  endRow: number;
  startRow: number;
};

export type DiffMergeDisplayModel = {
  conflictRanges: DiffMergeConflictRange[];
  rows: DiffMergeDisplayRow[];
};

export type DiffMergeConflictChoice = "ours" | "theirs" | "both";

export type DiffMergeConflictFile = {
  conflictRanges: DiffMergeConflictRange[];
  displayRows: DiffMergeDisplayRow[];
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
const defaultDiffMergeHunkContextLineCount = 3;

function getContentNewline(content: string) {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function splitContentLines(content: string) {
  const trailingNewline = /\r\n$|\n$|\r$/.test(content);
  const lines = content.split(/\r\n|\n|\r/);
  if (trailingNewline) {
    lines.pop();
  }
  return {
    lines,
    newline: getContentNewline(content),
    trailingNewline,
  };
}

function joinContentLines(lines: string[], newline: string, trailingNewline: boolean) {
  return `${lines.join(newline)}${trailingNewline ? newline : ""}`;
}

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
          conflictRanges: [],
          displayRows: [],
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
  const { lines } = splitContentLines(content);
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
      const oursLines = lines.slice(startLine, separatorLine - 1);
      const theirsLines = lines.slice(separatorLine, lineIndex);
      blocks.push({
        endLine: lineNumber,
        index: blocks.length,
        oursLines,
        oursLineCount: oursLines.length,
        separatorLine,
        startLine,
        theirsLines,
        theirsLineCount: theirsLines.length,
      });
      startLine = null;
      separatorLine = null;
    }
  });

  return blocks;
}

function createCommonLineMatrix(leftLines: readonly string[], rightLines: readonly string[]) {
  const matrix: number[][] = Array.from({ length: leftLines.length + 1 }, () => Array(rightLines.length + 1).fill(0));
  for (let leftIndex = leftLines.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLines.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] = leftLines[leftIndex] === rightLines[rightIndex]
        ? matrix[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }
  return matrix;
}

type DiffMergeAlignedConflictLine = {
  leftIndex?: number;
  leftText: string;
  leftChangeType: DiffMergeSideChangeType;
  rightIndex?: number;
  rightText: string;
  rightChangeType: DiffMergeSideChangeType;
};

function appendMergeReplacementRows(
  rows: DiffMergeAlignedConflictLine[],
  leftLines: readonly string[],
  leftStart: number,
  leftEnd: number,
  rightLines: readonly string[],
  rightStart: number,
  rightEnd: number,
) {
  const leftCount = leftEnd - leftStart;
  const rightCount = rightEnd - rightStart;
  const pairedCount = Math.min(leftCount, rightCount);

  for (let index = 0; index < pairedCount; index += 1) {
    rows.push({
      leftChangeType: "modify",
      leftIndex: leftStart + index,
      leftText: leftLines[leftStart + index] ?? "",
      rightChangeType: "modify",
      rightIndex: rightStart + index,
      rightText: rightLines[rightStart + index] ?? "",
    });
  }

  for (let leftIndex = leftStart + pairedCount; leftIndex < leftEnd; leftIndex += 1) {
    rows.push({
      leftChangeType: "delete",
      leftIndex,
      leftText: leftLines[leftIndex] ?? "",
      rightChangeType: "none",
      rightText: "",
    });
  }

  for (let rightIndex = rightStart + pairedCount; rightIndex < rightEnd; rightIndex += 1) {
    rows.push({
      leftChangeType: "none",
      leftText: "",
      rightChangeType: "add",
      rightIndex,
      rightText: rightLines[rightIndex] ?? "",
    });
  }
}

export function diffMergeConflictLines(
  leftLines: readonly string[],
  rightLines: readonly string[],
): DiffMergeAlignedConflictLine[] {
  const commonLineMatrix = createCommonLineMatrix(leftLines, rightLines);
  const alignedRows: DiffMergeAlignedConflictLine[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let pendingLeftStart = 0;
  let pendingRightStart = 0;

  while (leftIndex < leftLines.length && rightIndex < rightLines.length) {
    if (leftLines[leftIndex] === rightLines[rightIndex]) {
      appendMergeReplacementRows(
        alignedRows,
        leftLines,
        pendingLeftStart,
        leftIndex,
        rightLines,
        pendingRightStart,
        rightIndex,
      );
      alignedRows.push({
        leftChangeType: "none",
        leftIndex,
        leftText: leftLines[leftIndex] ?? "",
        rightChangeType: "none",
        rightIndex,
        rightText: rightLines[rightIndex] ?? "",
      });
      leftIndex += 1;
      rightIndex += 1;
      pendingLeftStart = leftIndex;
      pendingRightStart = rightIndex;
    } else if (commonLineMatrix[leftIndex + 1][rightIndex] >= commonLineMatrix[leftIndex][rightIndex + 1]) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  appendMergeReplacementRows(
    alignedRows,
    leftLines,
    pendingLeftStart,
    leftLines.length,
    rightLines,
    pendingRightStart,
    rightLines.length,
  );

  return alignedRows;
}

function recordMergeDisplayLineRange(row: DiffMergeDisplayRow, range: { maxLine: number; minLine: number }) {
  const lineNumbers = [row.leftLineNumber, row.rightLineNumber].filter((lineNumber): lineNumber is number => lineNumber !== undefined);
  for (const lineNumber of lineNumbers) {
    range.minLine = Math.min(range.minLine, lineNumber);
    range.maxLine = Math.max(range.maxLine, lineNumber);
  }
}

function getMergeDisplayLineRangeLabel(rows: readonly DiffMergeDisplayRow[]) {
  const range = {
    maxLine: Number.NEGATIVE_INFINITY,
    minLine: Number.POSITIVE_INFINITY,
  };
  for (const row of rows) {
    recordMergeDisplayLineRange(row, range);
  }
  if (!Number.isFinite(range.minLine) || !Number.isFinite(range.maxLine)) {
    return "Lines";
  }
  return range.minLine === range.maxLine ? `Line ${range.minLine}` : `Lines ${range.minLine}-${range.maxLine}`;
}

export function createDiffMergeDisplayModel(content: string, markerBlocks: DiffMergeConflictBlock[]): DiffMergeDisplayModel {
  const { lines } = splitContentLines(content);
  const conflictRanges: DiffMergeConflictRange[] = [];
  const rows: DiffMergeDisplayRow[] = [];
  let nextLineIndex = 0;

  for (const block of markerBlocks) {
    const blockStartIndex = Math.max(0, block.startLine - 1);
    for (let lineIndex = nextLineIndex; lineIndex < blockStartIndex; lineIndex += 1) {
      rows.push({
        kind: "line",
        leftLineNumber: lineIndex + 1,
        leftText: lines[lineIndex] ?? "",
        lineNumber: lineIndex + 1,
        rightLineNumber: lineIndex + 1,
        rightText: lines[lineIndex] ?? "",
      });
    }
    const startRow = rows.length;
    const conflictRows = diffMergeConflictLines(block.oursLines, block.theirsLines);
    if (conflictRows.length === 0) {
      conflictRows.push({
        leftChangeType: "none",
        leftText: "",
        rightChangeType: "none",
        rightText: "",
      });
    }
    for (let conflictLineIndex = 0; conflictLineIndex < conflictRows.length; conflictLineIndex += 1) {
      const conflictRow = conflictRows[conflictLineIndex];
      rows.push({
        conflictBlock: block,
        conflictLineIndex,
        kind: "line",
        leftChangeType: conflictRow.leftChangeType,
        leftLineNumber: conflictRow.leftIndex !== undefined ? block.startLine + conflictRow.leftIndex : undefined,
        leftText: conflictRow.leftText,
        lineNumber: block.startLine + (conflictRow.leftIndex ?? conflictRow.rightIndex ?? conflictLineIndex),
        rightChangeType: conflictRow.rightChangeType,
        rightLineNumber: conflictRow.rightIndex !== undefined ? block.startLine + conflictRow.rightIndex : undefined,
        rightText: conflictRow.rightText,
      });
    }
    conflictRanges.push({
      block,
      endRow: rows.length - 1,
      startRow,
    });
    nextLineIndex = block.endLine;
  }

  for (let lineIndex = nextLineIndex; lineIndex < lines.length; lineIndex += 1) {
    rows.push({
      kind: "line",
      leftLineNumber: lineIndex + 1,
      leftText: lines[lineIndex] ?? "",
      lineNumber: lineIndex + 1,
      rightLineNumber: lineIndex + 1,
      rightText: lines[lineIndex] ?? "",
    });
  }

  return {
    conflictRanges,
    rows,
  };
}

export function createDiffMergeDisplayRows(content: string, markerBlocks: DiffMergeConflictBlock[]): DiffMergeDisplayRow[] {
  return createDiffMergeDisplayModel(content, markerBlocks).rows;
}

export function createDiffMergeHunkDisplayModel(
  rows: readonly DiffMergeDisplayRow[],
  conflictRanges: readonly DiffMergeConflictRange[],
  contextLineCount = defaultDiffMergeHunkContextLineCount,
): DiffMergeDisplayModel {
  const rowCount = rows.length;
  const contextCount = Math.max(0, Math.floor(contextLineCount));
  const hunkRanges: Array<{ endRow: number; startRow: number }> = [];

  for (const range of conflictRanges) {
    const startRow = Math.max(0, range.startRow - contextCount);
    const endRow = Math.min(rowCount - 1, range.endRow + contextCount);
    const previousRange = hunkRanges[hunkRanges.length - 1];
    if (previousRange && startRow <= previousRange.endRow + 1) {
      previousRange.endRow = Math.max(previousRange.endRow, endRow);
    } else if (startRow <= endRow) {
      hunkRanges.push({ endRow, startRow });
    }
  }

  const hunkRows: DiffMergeDisplayRow[] = [];
  const hunkConflictRangeByBlock = new Map<DiffMergeConflictBlock, DiffMergeConflictRange>();

  hunkRanges.forEach((range, hunkIndex) => {
    const rangeRows = rows.slice(range.startRow, range.endRow + 1);
    const lineLabel = getMergeDisplayLineRangeLabel(rangeRows);
    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
      const sourceRow = rows[rowIndex];
      const hunkRow: DiffMergeDisplayRow = {
        ...sourceRow,
        hunkIndex,
      };
      if (rowIndex === range.startRow) {
        hunkRow.hunkHeader = {
          hunkNumber: hunkIndex + 1,
          lineLabel,
        };
      }
      hunkRows.push(hunkRow);

      if (sourceRow.conflictBlock) {
        const existingRange = hunkConflictRangeByBlock.get(sourceRow.conflictBlock);
        if (existingRange) {
          existingRange.endRow = hunkRows.length - 1;
        } else {
          hunkConflictRangeByBlock.set(sourceRow.conflictBlock, {
            block: sourceRow.conflictBlock,
            endRow: hunkRows.length - 1,
            startRow: hunkRows.length - 1,
          });
        }
      }
    }
  });

  return {
    conflictRanges: [...hunkConflictRangeByBlock.values()],
    rows: hunkRows,
  };
}

export function resolveDiffMergeConflictContent(
  content: string,
  startLine: number,
  choice: DiffMergeConflictChoice,
) {
  const { lines, newline, trailingNewline } = splitContentLines(content);
  const block = parseConflictMarkerBlocks(content).find((candidate) => candidate.startLine === startLine);
  if (!block) {
    throw new Error(`Conflict block at line ${startLine} was not found.`);
  }

  const acceptedLines = choice === "ours"
    ? block.oursLines
    : choice === "theirs"
      ? block.theirsLines
      : [...block.oursLines, ...block.theirsLines];
  const nextLines = [
    ...lines.slice(0, block.startLine - 1),
    ...acceptedLines,
    ...lines.slice(block.endLine),
  ];
  return joinContentLines(nextLines, newline, trailingNewline);
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
    const markerBlocks = result.exitCode === 0 ? parseConflictMarkerBlocks(result.stdout) : [];
    const displayModel = result.exitCode === 0
      ? createDiffMergeDisplayModel(result.stdout, markerBlocks)
      : { conflictRanges: [], rows: [] };
    loadedFiles.push({
      ...file,
      conflictRanges: displayModel.conflictRanges,
      displayRows: displayModel.rows,
      markerBlocks,
    });
  }
  return loadedFiles;
}

export async function resolveDiffMergeConflictBlock({
  choice,
  folderPath,
  path,
  runner = commandRunner,
  startLine,
}: {
  choice: DiffMergeConflictChoice;
  folderPath: string;
  path: string;
  runner?: CommandRunner;
  startLine: number;
}) {
  const readResult = await runner.runCommand({
    args: ["--", path],
    command: "cat",
    cwd: folderPath,
    timeoutMs: 5_000,
  });
  if (readResult.exitCode !== 0) {
    throw new Error(readResult.stderr || `Unable to read ${path}.`);
  }

  const resolvedContent = resolveDiffMergeConflictContent(readResult.stdout, startLine, choice);
  const writeResult = await runner.runCommand({
    args: ["-c", "cat > \"$1\"", "legend-diff-write", path],
    command: "sh",
    cwd: folderPath,
    input: resolvedContent,
    timeoutMs: 5_000,
  });
  if (writeResult.exitCode !== 0) {
    throw new Error(writeResult.stderr || `Unable to write ${path}.`);
  }
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
