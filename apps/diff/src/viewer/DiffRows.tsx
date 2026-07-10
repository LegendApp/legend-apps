import type {
  DiffDocument,
  DiffFileSummary,
  DiffRenderRow,
  DiffSideBySideFileHeader,
  DiffSideBySideRenderRow,
} from "@legend-apps/diff-parser";
import { DiffNativeRow } from "@legend-apps/diff-parser";
import {
  sourceViewerCodeFontFamily,
} from "@legend-apps/source-viewer";
import { SFSymbol } from "@legend-apps/sf-symbol";
import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getFilename } from "../diffFiles";
import {
  diffFileHeaderRowHeight,
  diffRowKindFileHeader,
} from "./diffViewerConstants";
import {
  getDirectoryPath,
  getFilePathContext,
  getFileStatusPresentation,
} from "./diffFilePresentation";

export type DiffRowRenderState = {
  document: {
    collapsedFileIndexList: readonly number[];
    current: DiffDocument | null;
    fileByIndex: ReadonlyMap<number, DiffFileSummary>;
    fileByRowStart: ReadonlyMap<number, DiffFileSummary>;
    fileHeaderRowIndexes: ReadonlySet<number>;
    sideBySideFileHeaderByListIndex: ReadonlyMap<number, DiffSideBySideFileHeader>;
    sideBySideRowCount: number;
  };
  nativeRows: {
    sideBySideConfigId: string;
    sideBySideConfigVersion: number;
    unifiedConfigId: string;
    unifiedConfigVersion: number;
  };
  presentation: {
    borderColor: string;
    fileHeaderBackgroundColor: string;
    fontFamily: string;
    fontSize: number;
    foregroundColor: string;
    hunkHeaderBackgroundColor: string;
    mutedColor: string;
    rowHeight: number;
    showOnlyHunks: boolean;
    syntaxAppearance: "dark" | "light";
    syntaxHighlightingEnabled: boolean;
    syntaxThemeName: string;
  };
};

type DiffHunkHeaderInfo = {
  hunkNumber: number;
  lineLabel: string;
};

type DiffHunkHeaderProps = {
  borderColor: string;
  fontFamily: string;
  fontSize: number;
  hunkHeaderBackgroundColor: string;
  info: DiffHunkHeaderInfo;
  mutedColor: string;
};

type DiffFileHeaderRowProps = {
  borderColor: string;
  fallbackFileIndex: number;
  fallbackPath: string;
  file: DiffFileSummary | undefined;
  fileHeaderBackgroundColor: string;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  isCollapsed: boolean;
  mutedColor: string;
  onToggleFileCollapsed: (fileIndex: number) => void;
  syntaxAppearance: "dark" | "light";
};

type DiffObservedFileHeaderRowProps = Omit<DiffFileHeaderRowProps, "isCollapsed"> & {
  collapsedFileIndexes$: Observable<Set<number>>;
};

type DiffUnifiedRowProps = {
  adaptiveRender: "light" | "normal";
  collapsedFileIndexes$: Observable<Set<number>>;
  index: number;
  onToggleFileCollapsed: (fileIndex: number) => void;
  rowRender$: Observable<DiffRowRenderState>;
  row: DiffRenderRow | undefined;
};

type DiffSideBySideRowProps = {
  adaptiveRender: "light" | "normal";
  collapsedFileIndexes$: Observable<Set<number>>;
  index: number;
  onToggleFileCollapsed: (fileIndex: number) => void;
  rowRender$: Observable<DiffRowRenderState>;
  row: DiffSideBySideRenderRow | undefined;
};

const diffDarkPalette = {
  addAccent: "#7ee787",
  addBackground: "#17351f",
  removeAccent: "#ff7b72",
  removeBackground: "#3a1d24",
};

const diffLightPalette = {
  addAccent: "#1a7f37",
  addBackground: "#dafbe1",
  removeAccent: "#cf222e",
  removeBackground: "#ffebe9",
};

export const diffUnifiedChangeBarWidth = 3;
export const diffUnifiedLineNumberWidth = 44;
export const diffUnifiedMarkerWidth = 14;
export const diffSideBySideLineNumberWidth = 40;
export const diffSideBySideMarkerWidth = 12;
export const diffHunkHeaderHeight = 32;

export function getDiffRowPalette(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark" ? diffDarkPalette : diffLightPalette;
}

export function getSideBySideDividerColor(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark" ? "#ffffff14" : "#1118271a";
}

function getPlainUnifiedRow(document: DiffDocument, index: number) {
  return document.getPlainRows(index, 1)[0];
}

function isRenderableHunkRow(row: DiffRenderRow | DiffSideBySideRenderRow | undefined): row is DiffRenderRow | DiffSideBySideRenderRow {
  return row !== undefined && row.kind !== diffRowKindFileHeader && row.kind !== "file-header" && row.hunkIndex >= 0;
}

export function isDiffUnifiedHunkStart(document: DiffDocument | null, index: number, row?: DiffRenderRow) {
  if (!document || !isRenderableHunkRow(row)) {
    return false;
  }

  const previousRow = index > 0 ? getPlainUnifiedRow(document, index - 1) : undefined;
  if (!isRenderableHunkRow(previousRow)) {
    return true;
  }
  return previousRow.fileIndex !== row.fileIndex || previousRow.hunkIndex !== row.hunkIndex;
}

function recordDiffLineRange(row: DiffRenderRow, range: { maxNew: number; maxOld: number; minNew: number; minOld: number }) {
  if (row.newLineNumber >= 0) {
    range.minNew = Math.min(range.minNew, row.newLineNumber);
    range.maxNew = Math.max(range.maxNew, row.newLineNumber);
  }
  if (row.oldLineNumber >= 0) {
    range.minOld = Math.min(range.minOld, row.oldLineNumber);
    range.maxOld = Math.max(range.maxOld, row.oldLineNumber);
  }
}

function getDiffLineRangeLabel(range: { maxNew: number; maxOld: number; minNew: number; minOld: number }) {
  const minLine = Number.isFinite(range.minNew) ? range.minNew : range.minOld;
  const maxLine = Number.isFinite(range.maxNew) ? range.maxNew : range.maxOld;
  if (!Number.isFinite(minLine) || !Number.isFinite(maxLine)) {
    return "Lines";
  }
  return minLine === maxLine ? `Line ${minLine}` : `Lines ${minLine}-${maxLine}`;
}

export function getDiffUnifiedHunkHeaderInfo(document: DiffDocument | null, index: number, row?: DiffRenderRow): DiffHunkHeaderInfo | null {
  if (!document || !row || !isDiffUnifiedHunkStart(document, index, row)) {
    return null;
  }

  const range = {
    maxNew: Number.NEGATIVE_INFINITY,
    maxOld: Number.NEGATIVE_INFINITY,
    minNew: Number.POSITIVE_INFINITY,
    minOld: Number.POSITIVE_INFINITY,
  };

  for (let rowIndex = index; rowIndex < document.rowCount; rowIndex += 1) {
    const currentRow = getPlainUnifiedRow(document, rowIndex);
    if (!isRenderableHunkRow(currentRow) || currentRow.fileIndex !== row.fileIndex || currentRow.hunkIndex !== row.hunkIndex) {
      break;
    }
    recordDiffLineRange(currentRow, range);
  }

  return {
    hunkNumber: row.hunkIndex + 1,
    lineLabel: getDiffLineRangeLabel(range),
  };
}

export function isDiffSideBySideHunkStart(
  document: DiffDocument | null,
  index: number,
  collapsedFileIndexList: readonly number[],
  row?: DiffSideBySideRenderRow,
) {
  if (!document || !isRenderableHunkRow(row)) {
    return false;
  }

  const previousRow = index > 0 ? document.getPlainSideBySideRow(index - 1, [...collapsedFileIndexList]) : undefined;
  if (!isRenderableHunkRow(previousRow)) {
    return true;
  }
  return previousRow.fileIndex !== row.fileIndex || previousRow.hunkIndex !== row.hunkIndex;
}

function recordSideBySideDiffLineRange(
  row: DiffSideBySideRenderRow,
  range: { maxNew: number; maxOld: number; minNew: number; minOld: number },
) {
  if (row.oldRowVisible) {
    recordDiffLineRange(row.oldRow, range);
  }
  if (row.newRowVisible) {
    recordDiffLineRange(row.newRowEqualsOldRow ? row.oldRow : row.newRow, range);
  }
}

export function getDiffSideBySideHunkHeaderInfo(
  document: DiffDocument | null,
  index: number,
  collapsedFileIndexList: readonly number[],
  rowCount: number,
  row?: DiffSideBySideRenderRow,
): DiffHunkHeaderInfo | null {
  if (!document || !row || !isDiffSideBySideHunkStart(document, index, collapsedFileIndexList, row)) {
    return null;
  }

  const range = {
    maxNew: Number.NEGATIVE_INFINITY,
    maxOld: Number.NEGATIVE_INFINITY,
    minNew: Number.POSITIVE_INFINITY,
    minOld: Number.POSITIVE_INFINITY,
  };
  const collapsedFileIndexes = [...collapsedFileIndexList];

  for (let rowIndex = index; rowIndex < rowCount; rowIndex += 1) {
    const currentRow = document.getPlainSideBySideRow(rowIndex, collapsedFileIndexes);
    if (!isRenderableHunkRow(currentRow) || currentRow.fileIndex !== row.fileIndex || currentRow.hunkIndex !== row.hunkIndex) {
      break;
    }
    recordSideBySideDiffLineRange(currentRow, range);
  }

  return {
    hunkNumber: row.hunkIndex + 1,
    lineLabel: getDiffLineRangeLabel(range),
  };
}

const DiffHunkHeader = memo(function DiffHunkHeader({
  borderColor,
  fontFamily,
  fontSize,
  hunkHeaderBackgroundColor,
  info,
  mutedColor,
}: DiffHunkHeaderProps) {
  return (
    <View style={[styles.hunkHeader, { backgroundColor: hunkHeaderBackgroundColor, borderColor }]}>
      <Text selectable={false} style={[{ color: mutedColor, fontFamily, fontSize }, styles.hunkHeaderTitle]}>
        Hunk {info.hunkNumber}: {info.lineLabel}
      </Text>
    </View>
  );
});

function DiffNativeUnifiedLineRow({
  adaptiveRender,
  index,
  rowRender$,
}: {
  adaptiveRender: "light" | "normal";
  index: number;
  rowRender$: Observable<DiffRowRenderState>;
}) {
  const nativeUnifiedRowConfigId = useValue(() => rowRender$.nativeRows.unifiedConfigId.get());
  const nativeUnifiedRowConfigVersion = useValue(() => rowRender$.nativeRows.unifiedConfigVersion.get());
  const rowHeight = useValue(() => rowRender$.presentation.rowHeight.get());

  return (
    <DiffNativeRow
      adaptiveRender={adaptiveRender}
      configId={nativeUnifiedRowConfigId}
      configVersion={nativeUnifiedRowConfigVersion}
      rowIndex={index}
      style={[styles.nativeDiffRow, { height: rowHeight }]}
    />
  );
}

function DiffNativeSideBySideLineRow({
  adaptiveRender,
  index,
  rowRender$,
}: {
  adaptiveRender: "light" | "normal";
  index: number;
  rowRender$: Observable<DiffRowRenderState>;
}) {
  const nativeSideBySideRowConfigId = useValue(() => rowRender$.nativeRows.sideBySideConfigId.get());
  const nativeSideBySideRowConfigVersion = useValue(() => rowRender$.nativeRows.sideBySideConfigVersion.get());
  const rowHeight = useValue(() => rowRender$.presentation.rowHeight.get());

  return (
    <DiffNativeRow
      adaptiveRender={adaptiveRender}
      configId={nativeSideBySideRowConfigId}
      configVersion={nativeSideBySideRowConfigVersion}
      rowIndex={index}
      style={[styles.nativeDiffRow, { height: rowHeight }]}
    />
  );
}

const DiffFileHeaderRow = memo(function DiffFileHeaderRow({
  borderColor,
  fallbackFileIndex,
  fallbackPath,
  file,
  fileHeaderBackgroundColor,
  fontFamily,
  fontSize,
  foregroundColor,
  isCollapsed,
  mutedColor,
  onToggleFileCollapsed,
  syntaxAppearance,
}: DiffFileHeaderRowProps) {
  const path = file?.path ?? fallbackPath;
  const filename = getFilename(path);
  const directory = getDirectoryPath(path);
  const fileIndex = file?.index ?? fallbackFileIndex;
  const statusPresentation = getFileStatusPresentation(file);
  const pathContext = file ? getFilePathContext(file, directory) : directory ? `${directory}/` : "";
  const fileHeaderLineHeight = Math.max(16, fontSize + 4);
  const palette = getDiffRowPalette(syntaxAppearance);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onToggleFileCollapsed(fileIndex)}
      style={({ pressed }) => [
        styles.fileRow,
        {
          backgroundColor: fileHeaderBackgroundColor,
          borderColor,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <View style={styles.fileDisclosure}>
        <SFSymbol color={mutedColor} name={isCollapsed ? "chevron.right" : "chevron.down"} size={12} />
      </View>
      {file ? (
        <View style={[styles.fileStatusIcon, { backgroundColor: statusPresentation.backgroundColor }]}>
          <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={12} yOffset={statusPresentation.iconYOffset} />
        </View>
      ) : null}
      <View style={styles.fileTitleGroup}>
        {pathContext ? (
          <Text selectable style={[styles.filePath, { color: mutedColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
            {pathContext}
          </Text>
        ) : null}
        <Text selectable style={[styles.fileName, { color: foregroundColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
          {filename}
        </Text>
      </View>
      {file ? (
        <View style={styles.fileMeta}>
          {file.isBinary ? (
            <Text
              accessibilityLabel="Binary file preview unavailable"
              selectable={false}
              style={[styles.binaryMessage, { color: mutedColor, fontFamily, lineHeight: fileHeaderLineHeight }]}
            >
              Binary file - preview unavailable
            </Text>
          ) : (
            <>
              <Text selectable={false} style={[styles.fileAdded, { color: palette.addAccent, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                +{file.additions}
              </Text>
              <Text selectable={false} style={[styles.fileRemoved, { color: palette.removeAccent, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                -{file.deletions}
              </Text>
            </>
          )}
        </View>
      ) : null}
    </Pressable>
  );
});

const DiffObservedFileHeaderRow = memo(function DiffObservedFileHeaderRow({
  collapsedFileIndexes$,
  fallbackFileIndex,
  file,
  ...props
}: DiffObservedFileHeaderRowProps) {
  const fileIndex = file?.index ?? fallbackFileIndex;
  const isCollapsed = useValue(() => collapsedFileIndexes$.get().has(fileIndex));
  return (
    <DiffFileHeaderRow
      {...props}
      fallbackFileIndex={fallbackFileIndex}
      file={file}
      isCollapsed={isCollapsed}
    />
  );
});

export const DiffUnifiedRow = memo(function DiffUnifiedRow({
  adaptiveRender,
  collapsedFileIndexes$,
  index,
  onToggleFileCollapsed,
  rowRender$,
  row,
}: DiffUnifiedRowProps) {
  const borderColor = useValue(() => rowRender$.presentation.borderColor.get());
  const document = useValue(() => rowRender$.document.current.get()) as DiffDocument | null;
  const fileHeaderBackgroundColor = useValue(() => rowRender$.presentation.fileHeaderBackgroundColor.get());
  const fileByIndex = useValue(() => rowRender$.document.fileByIndex.get());
  const fileByRowStart = useValue(() => rowRender$.document.fileByRowStart.get());
  const fileHeaderRowIndexes = useValue(() => rowRender$.document.fileHeaderRowIndexes.get());
  const fontFamily = useValue(() => rowRender$.presentation.fontFamily.get());
  const fontSize = useValue(() => rowRender$.presentation.fontSize.get());
  const foregroundColor = useValue(() => rowRender$.presentation.foregroundColor.get());
  const hunkHeaderBackgroundColor = useValue(() => rowRender$.presentation.hunkHeaderBackgroundColor.get());
  const mutedColor = useValue(() => rowRender$.presentation.mutedColor.get());
  const rowHeight = useValue(() => rowRender$.presentation.rowHeight.get());
  const showOnlyHunks = useValue(() => rowRender$.presentation.showOnlyHunks.get());
  const syntaxAppearance = useValue(() => rowRender$.presentation.syntaxAppearance.get());
  const isFileHeader = row?.kind === diffRowKindFileHeader || fileHeaderRowIndexes.has(index);
  const displayRow = row ?? (
    document && !isFileHeader
      ? getPlainUnifiedRow(document, index)
      : undefined
  );
  const hunkHeaderInfo = showOnlyHunks
    ? getDiffUnifiedHunkHeaderInfo(document, index, displayRow)
    : null;
  const file = row ? fileByIndex.get(row.fileIndex) : fileByRowStart.get(index);

  if (isFileHeader) {
    const fileIndex = file?.index ?? row?.fileIndex ?? index;
    return (
      <DiffObservedFileHeaderRow
        borderColor={borderColor}
        collapsedFileIndexes$={collapsedFileIndexes$}
        fallbackFileIndex={fileIndex}
        fallbackPath={row?.text ?? ""}
        file={file}
        fileHeaderBackgroundColor={fileHeaderBackgroundColor}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onToggleFileCollapsed={onToggleFileCollapsed}
        syntaxAppearance={syntaxAppearance}
      />
    );
  }

  return (
    <>
      {hunkHeaderInfo ? (
        <DiffHunkHeader
          borderColor={borderColor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          hunkHeaderBackgroundColor={hunkHeaderBackgroundColor}
          info={hunkHeaderInfo}
          mutedColor={mutedColor}
        />
      ) : null}
      {document ? (
        <DiffNativeUnifiedLineRow
          adaptiveRender={adaptiveRender}
          index={index}
          rowRender$={rowRender$}
        />
      ) : (
        <View style={{ height: rowHeight }} />
      )}
    </>
  );
});

export const DiffSideBySideRow = memo(function DiffSideBySideRow({
  adaptiveRender,
  collapsedFileIndexes$,
  index,
  onToggleFileCollapsed,
  rowRender$,
  row,
}: DiffSideBySideRowProps) {
  const borderColor = useValue(() => rowRender$.presentation.borderColor.get());
  const collapsedFileIndexList = useValue(() => rowRender$.document.collapsedFileIndexList.get());
  const document = useValue(() => rowRender$.document.current.get()) as DiffDocument | null;
  const fileHeaderBackgroundColor = useValue(() => rowRender$.presentation.fileHeaderBackgroundColor.get());
  const fileByIndex = useValue(() => rowRender$.document.fileByIndex.get());
  const fileByRowStart = useValue(() => rowRender$.document.fileByRowStart.get());
  const fontFamily = useValue(() => rowRender$.presentation.fontFamily.get());
  const fontSize = useValue(() => rowRender$.presentation.fontSize.get());
  const foregroundColor = useValue(() => rowRender$.presentation.foregroundColor.get());
  const hunkHeaderBackgroundColor = useValue(() => rowRender$.presentation.hunkHeaderBackgroundColor.get());
  const mutedColor = useValue(() => rowRender$.presentation.mutedColor.get());
  const rowHeight = useValue(() => rowRender$.presentation.rowHeight.get());
  const showOnlyHunks = useValue(() => rowRender$.presentation.showOnlyHunks.get());
  const sideBySideFileHeaderByListIndex = useValue(() => rowRender$.document.sideBySideFileHeaderByListIndex.get());
  const sideBySideRowCount = useValue(() => rowRender$.document.sideBySideRowCount.get());
  const syntaxAppearance = useValue(() => rowRender$.presentation.syntaxAppearance.get());
  const displayRow = showOnlyHunks
    ? row ?? (
        document
          ? document.getPlainSideBySideRow(index, [...collapsedFileIndexList])
          : undefined
      )
    : row;
  const fileHeader = row?.kind === "file-header"
    ? { fileIndex: row.fileIndex, sourceStart: row.sourceStart }
    : sideBySideFileHeaderByListIndex.get(index);
  const hunkHeaderInfo = showOnlyHunks
    ? getDiffSideBySideHunkHeaderInfo(
        document,
        index,
        collapsedFileIndexList,
        sideBySideRowCount,
        displayRow,
    )
    : null;

  if (fileHeader) {
    const file = fileByRowStart.get(fileHeader.sourceStart) ?? fileByIndex.get(fileHeader.fileIndex);
    const fileIndex = file?.index ?? index;
    return (
      <DiffObservedFileHeaderRow
        borderColor={borderColor}
        collapsedFileIndexes$={collapsedFileIndexes$}
        fallbackFileIndex={fileIndex}
        fallbackPath={file?.path ?? ""}
        file={file}
        fileHeaderBackgroundColor={fileHeaderBackgroundColor}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
        mutedColor={mutedColor}
        onToggleFileCollapsed={onToggleFileCollapsed}
        syntaxAppearance={syntaxAppearance}
      />
    );
  }

  return (
    <>
      {hunkHeaderInfo ? (
        <DiffHunkHeader
          borderColor={borderColor}
          fontFamily={fontFamily}
          fontSize={fontSize}
          hunkHeaderBackgroundColor={hunkHeaderBackgroundColor}
          info={hunkHeaderInfo}
          mutedColor={mutedColor}
        />
      ) : null}
      {document ? (
        <DiffNativeSideBySideLineRow
          adaptiveRender={adaptiveRender}
          index={index}
          rowRender$={rowRender$}
        />
      ) : (
        <View style={{ height: rowHeight }} />
      )}
    </>
  );
});

const styles = StyleSheet.create({
  hunkHeader: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    height: diffHunkHeaderHeight,
    paddingLeft: 10,
    paddingRight: 10,
  },
  hunkHeaderTitle: {
    fontSize: 11,
    fontWeight: "400",
    lineHeight: 14,
  },
  fileAdded: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  binaryMessage: {
    fontSize: 11,
  },
  fileDisclosure: {
    alignItems: "center",
    justifyContent: "center",
    width: 16,
  },
  fileMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  fileName: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },
  filePath: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 20,
  },
  fileRemoved: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  fileRow: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 6,
    height: diffFileHeaderRowHeight,
    paddingHorizontal: 10,
  },
  fileStatusIcon: {
    alignItems: "center",
    borderRadius: 3,
    height: 14,
    justifyContent: "center",
    width: 14,
  },
  fileTitleGroup: {
    alignItems: "baseline",
    flex: 1,
    flexDirection: "row",
  },
  nativeDiffRow: {
    width: "100%",
  },
});
