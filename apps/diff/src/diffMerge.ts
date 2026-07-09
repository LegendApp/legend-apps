import { commandRunner, type CommandRunner } from "@legend-apps/command-runner";

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

export type DiffMergeInlineChangeRange = {
  length: number;
  startColumn: number;
};

export type DiffMergeDisplayLine = {
  kind: "line";
  conflictBlock?: DiffMergeConflictBlock;
  conflictLineIndex?: number;
  hunkHeader?: DiffMergeHunkHeaderInfo;
  hunkIndex?: number;
  leftChangeType?: DiffMergeSideChangeType;
  leftInlineChangeRanges?: DiffMergeInlineChangeRange[];
  leftLineNumber?: number;
  leftText: string;
  lineNumber: number;
  rightChangeType?: DiffMergeSideChangeType;
  rightInlineChangeRanges?: DiffMergeInlineChangeRange[];
  rightLineNumber?: number;
  rightText: string;
  resolvedConflictBlock?: DiffMergeConflictBlock;
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
  hasUnsavedDraft?: boolean;
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

export function createReadyMergeState(files: DiffMergeConflictFile[]): DiffMergeState {
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  return {
    status: "ready",
    conflictBlockCount: files.reduce((count, file) => count + file.markerBlocks.length, 0),
    conflictFileCount: files.length,
    files,
    fileByPath,
  };
}

export function createDiffMergeConflictFileFromContent({
  content,
  path,
  stages,
}: {
  content: string;
  path: string;
  stages: DiffMergeConflictStage[];
}): DiffMergeConflictFile {
  const markerBlocks = parseConflictMarkerBlocks(content);
  const displayModel = createDiffMergeDisplayModel(content, markerBlocks);
  return {
    conflictRanges: displayModel.conflictRanges,
    displayRows: displayModel.rows,
    markerBlocks,
    path,
    stages,
  };
}

function getAcceptedDiffMergeConflictLines(block: DiffMergeConflictBlock, choice: DiffMergeConflictChoice) {
  return choice === "ours"
    ? block.oursLines
    : choice === "theirs"
      ? block.theirsLines
      : [...block.oursLines, ...block.theirsLines];
}

function diffMergeConflictBlocksMatch(left: DiffMergeConflictBlock, right: DiffMergeConflictBlock) {
  return left.startLine === right.startLine && left.endLine === right.endLine && left.index === right.index;
}

function adjustDiffMergeDisplayLineNumber(value: number | undefined, delta: number) {
  return value === undefined ? undefined : value + delta;
}

function createResolvedDiffMergeDisplayRows(
  block: DiffMergeConflictBlock,
  choice: DiffMergeConflictChoice,
): DiffMergeDisplayRow[] {
  const acceptedLines = getAcceptedDiffMergeConflictLines(block, choice);
  const alignedRows = diffMergeConflictLines(block.oursLines, acceptedLines);
  if (alignedRows.length === 0) {
    alignedRows.push({
      leftChangeType: "none",
      leftText: "",
      rightChangeType: "none",
      rightText: "",
    });
  }

  return alignedRows.map((row, index) => ({
    kind: "line",
    leftChangeType: row.leftChangeType,
    ...(row.leftInlineChangeRanges ? { leftInlineChangeRanges: row.leftInlineChangeRanges } : null),
    leftLineNumber: row.leftIndex !== undefined ? block.startLine + row.leftIndex : undefined,
    leftText: row.leftText,
    lineNumber: block.startLine + (row.leftIndex ?? row.rightIndex ?? index),
    resolvedConflictBlock: block,
    rightChangeType: row.rightChangeType,
    ...(row.rightInlineChangeRanges ? { rightInlineChangeRanges: row.rightInlineChangeRanges } : null),
    rightLineNumber: row.rightIndex !== undefined ? block.startLine + row.rightIndex : undefined,
    rightText: row.rightText,
  }));
}

function createDiffMergeConflictRangesFromRows(rows: readonly DiffMergeDisplayRow[]) {
  const conflictRanges: DiffMergeConflictRange[] = [];
  const conflictRangeByBlock = new Map<DiffMergeConflictBlock, DiffMergeConflictRange>();
  rows.forEach((row, rowIndex) => {
    if (row.conflictBlock) {
      const range = conflictRangeByBlock.get(row.conflictBlock);
      if (range) {
        range.endRow = rowIndex;
      } else {
        const nextRange = {
          block: row.conflictBlock,
          endRow: rowIndex,
          startRow: rowIndex,
        };
        conflictRangeByBlock.set(row.conflictBlock, nextRange);
        conflictRanges.push(nextRange);
      }
    }
  });
  return conflictRanges;
}

export function createDiffMergeDraftFileWithResolvedBlock({
  block,
  choice,
  content,
  file,
}: {
  block: DiffMergeConflictBlock;
  choice: DiffMergeConflictChoice;
  content: string;
  file: DiffMergeConflictFile;
}): DiffMergeConflictFile {
  const markerBlocks = parseConflictMarkerBlocks(content);
  const remainingBlocks = file.markerBlocks.filter((candidate) => !diffMergeConflictBlocksMatch(candidate, block));
  const blockByPreviousBlock = new Map<DiffMergeConflictBlock, DiffMergeConflictBlock>();
  remainingBlocks.forEach((remainingBlock, index) => {
    const nextBlock = markerBlocks[index];
    if (nextBlock) {
      blockByPreviousBlock.set(remainingBlock, nextBlock);
    }
  });

  const resolvedRows = createResolvedDiffMergeDisplayRows(block, choice);
  const replacedLineCount = block.endLine - block.startLine + 1;
  const lineDelta = getAcceptedDiffMergeConflictLines(block, choice).length - replacedLineCount;
  const displayRows: DiffMergeDisplayRow[] = [];
  let didReplaceBlock = false;

  for (const row of file.displayRows) {
    const isResolvedBlockRow = row.conflictBlock && diffMergeConflictBlocksMatch(row.conflictBlock, block);
    if (isResolvedBlockRow) {
      if (!didReplaceBlock) {
        displayRows.push(...resolvedRows);
        didReplaceBlock = true;
      }
    } else {
      const nextConflictBlock = row.conflictBlock ? blockByPreviousBlock.get(row.conflictBlock) : undefined;
      const shouldAdjustLineNumbers = didReplaceBlock || row.lineNumber > block.endLine;
      displayRows.push({
        ...row,
        ...(row.conflictBlock ? { conflictBlock: nextConflictBlock ?? row.conflictBlock } : null),
        ...(shouldAdjustLineNumbers
          ? {
            leftLineNumber: adjustDiffMergeDisplayLineNumber(row.leftLineNumber, lineDelta),
            lineNumber: row.lineNumber + lineDelta,
            rightLineNumber: adjustDiffMergeDisplayLineNumber(row.rightLineNumber, lineDelta),
          }
          : null),
      });
    }
  }

  return {
    ...file,
    conflictRanges: createDiffMergeConflictRangesFromRows(displayRows),
    displayRows,
    hasUnsavedDraft: true,
    markerBlocks,
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

type DiffMergeInlineToken = {
  length: number;
  startColumn: number;
  text: string;
};

type DiffMergeAlignedConflictLine = {
  leftIndex?: number;
  leftInlineChangeRanges?: DiffMergeInlineChangeRange[];
  leftText: string;
  leftChangeType: DiffMergeSideChangeType;
  rightIndex?: number;
  rightInlineChangeRanges?: DiffMergeInlineChangeRange[];
  rightText: string;
  rightChangeType: DiffMergeSideChangeType;
};

function pushMergeModifyRow(
  rows: DiffMergeAlignedConflictLine[],
  leftIndex: number,
  leftText: string,
  rightIndex: number,
  rightText: string,
) {
  const inlineRanges = createInlineReplacementRanges(leftText, rightText);
  rows.push({
    leftChangeType: "modify",
    leftIndex,
    ...(inlineRanges.leftRanges.length > 0 ? { leftInlineChangeRanges: inlineRanges.leftRanges } : null),
    leftText,
    rightChangeType: "modify",
    rightIndex,
    ...(inlineRanges.rightRanges.length > 0 ? { rightInlineChangeRanges: inlineRanges.rightRanges } : null),
    rightText,
  });
}

function pushMergeDeleteRow(
  rows: DiffMergeAlignedConflictLine[],
  leftIndex: number,
  leftText: string,
) {
  rows.push({
    leftChangeType: "delete",
    leftIndex,
    leftText,
    rightChangeType: "none",
    rightText: "",
  });
}

function pushMergeAddRow(
  rows: DiffMergeAlignedConflictLine[],
  rightIndex: number,
  rightText: string,
) {
  rows.push({
    leftChangeType: "none",
    leftText: "",
    rightChangeType: "add",
    rightIndex,
    rightText,
  });
}

function tokenizeInlineDiffText(text: string): DiffMergeInlineToken[] {
  const tokens: DiffMergeInlineToken[] = [];
  const tokenPattern = /\s+|[A-Za-z0-9_$]+|./g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(text))) {
    tokens.push({
      length: match[0].length,
      startColumn: match.index,
      text: match[0],
    });
  }
  return tokens;
}

function createCommonTokenMatrix(leftTokens: readonly DiffMergeInlineToken[], rightTokens: readonly DiffMergeInlineToken[]) {
  const matrix: number[][] = Array.from({ length: leftTokens.length + 1 }, () => Array(rightTokens.length + 1).fill(0));
  for (let leftIndex = leftTokens.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightTokens.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] = leftTokens[leftIndex]?.text === rightTokens[rightIndex]?.text
        ? matrix[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }
  return matrix;
}

function getInlineTokenBlockRange(tokens: readonly DiffMergeInlineToken[], startIndex: number, endIndex: number) {
  const firstToken = tokens[startIndex];
  const lastToken = tokens[endIndex - 1];
  return firstToken && lastToken
    ? {
        endColumn: lastToken.startColumn + lastToken.length,
        startColumn: firstToken.startColumn,
      }
    : null;
}

function appendInlineRange(
  ranges: DiffMergeInlineChangeRange[],
  startColumn: number,
  endColumn: number,
) {
  if (endColumn > startColumn) {
    const previousRange = ranges[ranges.length - 1];
    if (previousRange && previousRange.startColumn + previousRange.length === startColumn) {
      previousRange.length = endColumn - previousRange.startColumn;
    } else {
      ranges.push({
        length: endColumn - startColumn,
        startColumn,
      });
    }
  }
}

function appendInlineTextRange(
  ranges: DiffMergeInlineChangeRange[],
  text: string,
  startColumn: number,
  endColumn: number,
) {
  let trimmedStartColumn = startColumn;
  let trimmedEndColumn = endColumn;
  while (trimmedStartColumn < trimmedEndColumn && /\s/.test(text[trimmedStartColumn] ?? "")) {
    trimmedStartColumn += 1;
  }
  while (trimmedEndColumn > trimmedStartColumn && /\s/.test(text[trimmedEndColumn - 1] ?? "")) {
    trimmedEndColumn -= 1;
  }
  appendInlineRange(ranges, trimmedStartColumn, trimmedEndColumn);
}

function isInlineWordCharacter(value: string | undefined) {
  return Boolean(value && /[A-Za-z0-9_$]/.test(value));
}

function appendInlineReplacementRanges(
  leftRanges: DiffMergeInlineChangeRange[],
  rightRanges: DiffMergeInlineChangeRange[],
  leftText: string,
  leftStartColumn: number,
  leftEndColumn: number,
  rightText: string,
  rightStartColumn: number,
  rightEndColumn: number,
) {
  let commonPrefixLength = 0;
  const maxPrefixLength = Math.min(leftEndColumn - leftStartColumn, rightEndColumn - rightStartColumn);
  while (
    commonPrefixLength < maxPrefixLength &&
    leftText[leftStartColumn + commonPrefixLength] === rightText[rightStartColumn + commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let commonSuffixLength = 0;
  const maxSuffixLength = maxPrefixLength - commonPrefixLength;
  while (
    commonSuffixLength < maxSuffixLength &&
    leftText[leftEndColumn - commonSuffixLength - 1] === rightText[rightEndColumn - commonSuffixLength - 1]
  ) {
    commonSuffixLength += 1;
  }
  if (commonPrefixLength === 1 && isInlineWordCharacter(leftText[leftStartColumn])) {
    commonPrefixLength = 0;
  }
  if (commonSuffixLength === 1 && isInlineWordCharacter(leftText[leftEndColumn - 1])) {
    commonSuffixLength = 0;
  }

  appendInlineTextRange(leftRanges, leftText, leftStartColumn + commonPrefixLength, leftEndColumn - commonSuffixLength);
  appendInlineTextRange(rightRanges, rightText, rightStartColumn + commonPrefixLength, rightEndColumn - commonSuffixLength);
}

function appendInlineTokenReplacementRanges(
  leftRanges: DiffMergeInlineChangeRange[],
  rightRanges: DiffMergeInlineChangeRange[],
  leftText: string,
  leftTokens: readonly DiffMergeInlineToken[],
  leftStartTokenIndex: number,
  leftEndTokenIndex: number,
  rightText: string,
  rightTokens: readonly DiffMergeInlineToken[],
  rightStartTokenIndex: number,
  rightEndTokenIndex: number,
) {
  const leftRange = getInlineTokenBlockRange(leftTokens, leftStartTokenIndex, leftEndTokenIndex);
  const rightRange = getInlineTokenBlockRange(rightTokens, rightStartTokenIndex, rightEndTokenIndex);
  if (leftRange && rightRange) {
    appendInlineReplacementRanges(
      leftRanges,
      rightRanges,
      leftText,
      leftRange.startColumn,
      leftRange.endColumn,
      rightText,
      rightRange.startColumn,
      rightRange.endColumn,
    );
  } else if (leftRange) {
    appendInlineTextRange(leftRanges, leftText, leftRange.startColumn, leftRange.endColumn);
  } else if (rightRange) {
    appendInlineTextRange(rightRanges, rightText, rightRange.startColumn, rightRange.endColumn);
  }
}

function createInlineReplacementRanges(
  leftText: string,
  rightText: string,
): {
  leftRanges: DiffMergeInlineChangeRange[];
  rightRanges: DiffMergeInlineChangeRange[];
} {
  if (leftText === rightText) {
    return {
      leftRanges: [],
      rightRanges: [],
    };
  }

  const leftTokens = tokenizeInlineDiffText(leftText);
  const rightTokens = tokenizeInlineDiffText(rightText);
  const leftRanges: DiffMergeInlineChangeRange[] = [];
  const rightRanges: DiffMergeInlineChangeRange[] = [];
  if (leftTokens.length * rightTokens.length > 20_000) {
    appendInlineReplacementRanges(leftRanges, rightRanges, leftText, 0, leftText.length, rightText, 0, rightText.length);
    return {
      leftRanges,
      rightRanges,
    };
  }

  const commonTokenMatrix = createCommonTokenMatrix(leftTokens, rightTokens);
  let leftTokenIndex = 0;
  let rightTokenIndex = 0;
  let pendingLeftStart = 0;
  let pendingRightStart = 0;

  while (leftTokenIndex < leftTokens.length && rightTokenIndex < rightTokens.length) {
    if (leftTokens[leftTokenIndex]?.text === rightTokens[rightTokenIndex]?.text) {
      appendInlineTokenReplacementRanges(
        leftRanges,
        rightRanges,
        leftText,
        leftTokens,
        pendingLeftStart,
        leftTokenIndex,
        rightText,
        rightTokens,
        pendingRightStart,
        rightTokenIndex,
      );
      leftTokenIndex += 1;
      rightTokenIndex += 1;
      pendingLeftStart = leftTokenIndex;
      pendingRightStart = rightTokenIndex;
    } else if (commonTokenMatrix[leftTokenIndex + 1][rightTokenIndex] >= commonTokenMatrix[leftTokenIndex][rightTokenIndex + 1]) {
      leftTokenIndex += 1;
    } else {
      rightTokenIndex += 1;
    }
  }

  appendInlineTokenReplacementRanges(
    leftRanges,
    rightRanges,
    leftText,
    leftTokens,
    pendingLeftStart,
    leftTokens.length,
    rightText,
    rightTokens,
    pendingRightStart,
    rightTokens.length,
  );

  return {
    leftRanges,
    rightRanges,
  };
}

export function diffMergeInlineChangeRanges(leftText: string, rightText: string) {
  return createInlineReplacementRanges(leftText, rightText);
}

function getMergeLineSimilarity(leftText: string, rightText: string) {
  const normalizeTokens = (text: string) => {
    const tokens = new Set<string>();
    for (const token of tokenizeInlineDiffText(text)) {
      if (/^[A-Za-z0-9_$]+$/.test(token.text)) {
        const normalizedToken = token.text.toLowerCase();
        tokens.add(normalizedToken);
        const tokenParts = token.text
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .split(/[_\s]+|(?=\d)|(?<=\d)/)
          .filter(Boolean);
        for (const part of tokenParts) {
          tokens.add(part.toLowerCase());
        }
      }
    }
    return tokens;
  };
  const leftTokens = normalizeTokens(leftText);
  const rightTokens = normalizeTokens(rightText);
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let commonCount = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      commonCount += 1;
    }
  }
  return commonCount / (leftTokens.size + rightTokens.size - commonCount);
}

function appendUnbalancedMergeReplacementRows(
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
  const minSimilarity = 0.25;
  const scoreMatrix: number[][] = Array.from({ length: leftCount + 1 }, () => Array(rightCount + 1).fill(0));

  for (let leftOffset = leftCount - 1; leftOffset >= 0; leftOffset -= 1) {
    for (let rightOffset = rightCount - 1; rightOffset >= 0; rightOffset -= 1) {
      const leftText = leftLines[leftStart + leftOffset] ?? "";
      const rightText = rightLines[rightStart + rightOffset] ?? "";
      const similarity = getMergeLineSimilarity(leftText, rightText);
      const pairScore = similarity >= minSimilarity
        ? scoreMatrix[leftOffset + 1][rightOffset + 1] + 1 + similarity
        : Number.NEGATIVE_INFINITY;
      scoreMatrix[leftOffset][rightOffset] = Math.max(
        pairScore,
        scoreMatrix[leftOffset + 1][rightOffset],
        scoreMatrix[leftOffset][rightOffset + 1],
      );
    }
  }

  let leftOffset = 0;
  let rightOffset = 0;
  while (leftOffset < leftCount || rightOffset < rightCount) {
    const leftText = leftLines[leftStart + leftOffset] ?? "";
    const rightText = rightLines[rightStart + rightOffset] ?? "";
    const similarity = leftOffset < leftCount && rightOffset < rightCount
      ? getMergeLineSimilarity(leftText, rightText)
      : 0;
    const pairScore = similarity >= minSimilarity
      ? scoreMatrix[leftOffset + 1]?.[rightOffset + 1] + 1 + similarity
      : Number.NEGATIVE_INFINITY;
    const currentScore = scoreMatrix[leftOffset]?.[rightOffset] ?? 0;
    if (leftOffset < leftCount && rightOffset < rightCount && pairScore === currentScore) {
      pushMergeModifyRow(rows, leftStart + leftOffset, leftText, rightStart + rightOffset, rightText);
      leftOffset += 1;
      rightOffset += 1;
    } else if (
      rightOffset < rightCount &&
      (leftOffset >= leftCount || (scoreMatrix[leftOffset]?.[rightOffset + 1] ?? 0) >= (scoreMatrix[leftOffset + 1]?.[rightOffset] ?? 0))
    ) {
      pushMergeAddRow(rows, rightStart + rightOffset, rightText);
      rightOffset += 1;
    } else if (leftOffset < leftCount) {
      pushMergeDeleteRow(rows, leftStart + leftOffset, leftText);
      leftOffset += 1;
    }
  }
}

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

  if (leftCount === rightCount) {
    for (let index = 0; index < leftCount; index += 1) {
      pushMergeModifyRow(
        rows,
        leftStart + index,
        leftLines[leftStart + index] ?? "",
        rightStart + index,
        rightLines[rightStart + index] ?? "",
      );
    }
  } else {
    appendUnbalancedMergeReplacementRows(rows, leftLines, leftStart, leftEnd, rightLines, rightStart, rightEnd);
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
        ...(conflictRow.leftInlineChangeRanges ? { leftInlineChangeRanges: conflictRow.leftInlineChangeRanges } : null),
        leftLineNumber: conflictRow.leftIndex !== undefined ? block.startLine + conflictRow.leftIndex : undefined,
        leftText: conflictRow.leftText,
        lineNumber: block.startLine + (conflictRow.leftIndex ?? conflictRow.rightIndex ?? conflictLineIndex),
        rightChangeType: conflictRow.rightChangeType,
        ...(conflictRow.rightInlineChangeRanges ? { rightInlineChangeRanges: conflictRow.rightInlineChangeRanges } : null),
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
  const candidateHunkRanges: Array<{ endRow: number; startRow: number }> = [];
  const hunkRanges: Array<{ endRow: number; startRow: number }> = [];

  for (const range of conflictRanges) {
    const startRow = Math.max(0, range.startRow - contextCount);
    const endRow = Math.min(rowCount - 1, range.endRow + contextCount);
    if (startRow <= endRow) {
      candidateHunkRanges.push({ endRow, startRow });
    }
  }
  rows.forEach((row, rowIndex) => {
    const isResolvedConflictRow = row.resolvedConflictBlock !== undefined;
    const isChangedRow =
      row.leftChangeType !== undefined ||
      row.rightChangeType !== undefined;
    if (isResolvedConflictRow || isChangedRow) {
      const startRow = Math.max(0, rowIndex - contextCount);
      const endRow = Math.min(rowCount - 1, rowIndex + contextCount);
      if (startRow <= endRow) {
        candidateHunkRanges.push({ endRow, startRow });
      }
    }
  });

  candidateHunkRanges
    .sort((left, right) => left.startRow - right.startRow || left.endRow - right.endRow)
    .forEach((range) => {
      const previousRange = hunkRanges[hunkRanges.length - 1];
      if (previousRange && range.startRow <= previousRange.endRow + 1) {
        previousRange.endRow = Math.max(previousRange.endRow, range.endRow);
      } else {
        hunkRanges.push({ ...range });
      }
    });

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
    loadedFiles.push(result.exitCode === 0
      ? createDiffMergeConflictFileFromContent({
        content: result.stdout,
        path: file.path,
        stages: file.stages,
      })
      : {
        ...file,
        conflictRanges: [],
        displayRows: [],
        markerBlocks: [],
      });
  }
  return loadedFiles;
}

export async function readDiffMergeFileContent({
  folderPath,
  path,
  runner = commandRunner,
}: {
  folderPath: string;
  path: string;
  runner?: CommandRunner;
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
  return readResult.stdout;
}

export async function writeDiffMergeFileContent({
  content,
  folderPath,
  path,
  runner = commandRunner,
}: {
  content: string;
  folderPath: string;
  path: string;
  runner?: CommandRunner;
}) {
  const writeResult = await runner.runCommand({
    args: ["-c", "cat > \"$1\"", "legend-diff-write", path],
    command: "sh",
    cwd: folderPath,
    input: content,
    timeoutMs: 5_000,
  });
  if (writeResult.exitCode !== 0) {
    throw new Error(writeResult.stderr || `Unable to write ${path}.`);
  }
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
  const content = await readDiffMergeFileContent({ folderPath, path, runner });
  const resolvedContent = resolveDiffMergeConflictContent(content, startLine, choice);
  await writeDiffMergeFileContent({ content: resolvedContent, folderPath, path, runner });
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
