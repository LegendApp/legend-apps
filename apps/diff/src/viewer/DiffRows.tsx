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

type DiffHunkHeaderCacheEntry = {
  fileIndex: number;
  hunkIndex: number;
  info: DiffHunkHeaderInfo;
  rowCount: number;
};

const unifiedHunkHeaderCache = new WeakMap<DiffDocument, Map<number, DiffHunkHeaderCacheEntry>>();
const sideBySideHunkHeaderCache = new WeakMap<DiffDocument, {
  collapsedFileIndexesKey: string;
  entries: Map<number, DiffHunkHeaderCacheEntry>;
}>();

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
  hasHunkHeader: boolean;
  index: number;
  isFileHeader: boolean;
  nativeConfigId: string;
  nativeRowHeight: number;
  onToggleFileCollapsed: (fileIndex: number) => void;
  rowRender$: Observable<DiffRowRenderState>;
  row: DiffRenderRow | undefined;
};

type DiffSideBySideRowProps = {
  adaptiveRender: "light" | "normal";
  collapsedFileIndexes$: Observable<Set<number>>;
  hasHunkHeader: boolean;
  index: number;
  isFileHeader: boolean;
  nativeConfigId: string;
  nativeRowHeight: number;
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
  if (!document || !isRenderableHunkRow(row)) {
    return null;
  }

  let cache = unifiedHunkHeaderCache.get(document);
  if (!cache) {
    cache = new Map();
    unifiedHunkHeaderCache.set(document, cache);
  }
  const cached = cache.get(index);
  if (
    cached
    && cached.fileIndex === row.fileIndex
    && cached.hunkIndex === row.hunkIndex
    && cached.rowCount === document.rowCount
  ) {
    return cached.info;
  }
  if (!isDiffUnifiedHunkStart(document, index, row)) {
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

  const info = {
    hunkNumber: row.hunkIndex + 1,
    lineLabel: getDiffLineRangeLabel(range),
  };
  cache.set(index, {
    fileIndex: row.fileIndex,
    hunkIndex: row.hunkIndex,
    info,
    rowCount: document.rowCount,
  });
  return info;
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
  if (!document || !isRenderableHunkRow(row)) {
    return null;
  }

  const collapsedFileIndexesKey = collapsedFileIndexList.join(",");
  let cacheState = sideBySideHunkHeaderCache.get(document);
  if (!cacheState || cacheState.collapsedFileIndexesKey !== collapsedFileIndexesKey) {
    cacheState = {
      collapsedFileIndexesKey,
      entries: new Map(),
    };
    sideBySideHunkHeaderCache.set(document, cacheState);
  }
  const cached = cacheState.entries.get(index);
  if (
    cached
    && cached.fileIndex === row.fileIndex
    && cached.hunkIndex === row.hunkIndex
    && cached.rowCount === rowCount
  ) {
    return cached.info;
  }
  if (!isDiffSideBySideHunkStart(document, index, collapsedFileIndexList, row)) {
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

  const info = {
    hunkNumber: row.hunkIndex + 1,
    lineLabel: getDiffLineRangeLabel(range),
  };
  cacheState.entries.set(index, {
    fileIndex: row.fileIndex,
    hunkIndex: row.hunkIndex,
    info,
    rowCount,
  });
  return info;
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
  nativeConfigId,
  nativeRowHeight,
}: {
  adaptiveRender: "light" | "normal";
  index: number;
  nativeConfigId: string;
  nativeRowHeight: number;
}) {
  return (
    <DiffNativeRow
      adaptiveRender={adaptiveRender}
      configId={nativeConfigId}
      rowIndex={index}
      style={[styles.nativeDiffRow, { height: nativeRowHeight }]}
    />
  );
}

function DiffNativeSideBySideLineRow({
  adaptiveRender,
  index,
  nativeConfigId,
  nativeRowHeight,
}: {
  adaptiveRender: "light" | "normal";
  index: number;
  nativeConfigId: string;
  nativeRowHeight: number;
}) {
  return (
    <DiffNativeRow
      adaptiveRender={adaptiveRender}
      configId={nativeConfigId}
      rowIndex={index}
      style={[styles.nativeDiffRow, { height: nativeRowHeight }]}
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
          <Text selectable={false} style={[styles.filePath, { color: mutedColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
            {pathContext}
          </Text>
        ) : null}
        <Text selectable={false} style={[styles.fileName, { color: foregroundColor, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]} numberOfLines={1}>
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

const DiffUnifiedFileHeaderRow = memo(function DiffUnifiedFileHeaderRow({
  collapsedFileIndexes$,
  index,
  onToggleFileCollapsed,
  rowRender$,
  row,
}: DiffUnifiedRowProps) {
  const presentation = useValue(() => ({
    borderColor: rowRender$.presentation.borderColor.get(),
    fileHeaderBackgroundColor: rowRender$.presentation.fileHeaderBackgroundColor.get(),
    fontFamily: rowRender$.presentation.fontFamily.get(),
    fontSize: rowRender$.presentation.fontSize.get(),
    foregroundColor: rowRender$.presentation.foregroundColor.get(),
    mutedColor: rowRender$.presentation.mutedColor.get(),
    syntaxAppearance: rowRender$.presentation.syntaxAppearance.get(),
  }));
  const file = useValue(() => row
    ? rowRender$.document.fileByIndex.get().get(row.fileIndex)
    : rowRender$.document.fileByRowStart.get().get(index));
  const fileIndex = file?.index ?? row?.fileIndex ?? index;

  return (
    <DiffObservedFileHeaderRow
      borderColor={presentation.borderColor}
      collapsedFileIndexes$={collapsedFileIndexes$}
      fallbackFileIndex={fileIndex}
      fallbackPath={row?.text ?? ""}
      file={file}
      fileHeaderBackgroundColor={presentation.fileHeaderBackgroundColor}
      fontFamily={presentation.fontFamily}
      fontSize={presentation.fontSize}
      foregroundColor={presentation.foregroundColor}
      mutedColor={presentation.mutedColor}
      onToggleFileCollapsed={onToggleFileCollapsed}
      syntaxAppearance={presentation.syntaxAppearance}
    />
  );
});

const DiffUnifiedHunkHeaderRow = memo(function DiffUnifiedHunkHeaderRow({
  index,
  rowRender$,
  row,
}: DiffUnifiedRowProps) {
  const hunkHeader = useValue(() => {
    const document = rowRender$.document.current.get() as DiffDocument | null;
    const displayRow = row ?? (document ? getPlainUnifiedRow(document, index) : undefined);
    return {
      borderColor: rowRender$.presentation.borderColor.get(),
      fontFamily: rowRender$.presentation.fontFamily.get(),
      fontSize: rowRender$.presentation.fontSize.get(),
      hunkHeaderBackgroundColor: rowRender$.presentation.hunkHeaderBackgroundColor.get(),
      info: getDiffUnifiedHunkHeaderInfo(document, index, displayRow),
      mutedColor: rowRender$.presentation.mutedColor.get(),
    };
  });

  return hunkHeader.info ? (
    <DiffHunkHeader
      borderColor={hunkHeader.borderColor}
      fontFamily={hunkHeader.fontFamily}
      fontSize={hunkHeader.fontSize}
      hunkHeaderBackgroundColor={hunkHeader.hunkHeaderBackgroundColor}
      info={hunkHeader.info}
      mutedColor={hunkHeader.mutedColor}
    />
  ) : null;
});

const DiffUnifiedLineRow = memo(function DiffUnifiedLineRow(props: DiffUnifiedRowProps) {
  const { adaptiveRender, hasHunkHeader, index, nativeConfigId, nativeRowHeight } = props;
  return (
    <>
      {hasHunkHeader ? <DiffUnifiedHunkHeaderRow {...props} /> : null}
      <DiffNativeUnifiedLineRow
        adaptiveRender={adaptiveRender}
        index={index}
        nativeConfigId={nativeConfigId}
        nativeRowHeight={nativeRowHeight}
      />
    </>
  );
});

export const DiffUnifiedRow = memo(function DiffUnifiedRow(props: DiffUnifiedRowProps) {
  return props.isFileHeader
    ? <DiffUnifiedFileHeaderRow {...props} />
    : <DiffUnifiedLineRow {...props} />;
});

const DiffSideBySideFileHeaderRow = memo(function DiffSideBySideFileHeaderRow({
  collapsedFileIndexes$,
  index,
  onToggleFileCollapsed,
  rowRender$,
  row,
}: DiffSideBySideRowProps) {
  const presentation = useValue(() => ({
    borderColor: rowRender$.presentation.borderColor.get(),
    fileHeaderBackgroundColor: rowRender$.presentation.fileHeaderBackgroundColor.get(),
    fontFamily: rowRender$.presentation.fontFamily.get(),
    fontSize: rowRender$.presentation.fontSize.get(),
    foregroundColor: rowRender$.presentation.foregroundColor.get(),
    mutedColor: rowRender$.presentation.mutedColor.get(),
    syntaxAppearance: rowRender$.presentation.syntaxAppearance.get(),
  }));
  const fileHeaderAndFile = useValue(() => {
    const fileHeader = row?.kind === "file-header"
      ? { fileIndex: row.fileIndex, sourceStart: row.sourceStart }
      : rowRender$.document.sideBySideFileHeaderByListIndex.get().get(index);
    const file = fileHeader
      ? rowRender$.document.fileByIndex.get().get(fileHeader.fileIndex)
        ?? rowRender$.document.fileByRowStart.get().get(fileHeader.sourceStart)
      : undefined;
    return { file, fileHeader };
  });
  const file = fileHeaderAndFile.file;
  const fileIndex = file?.index ?? index;

  return (
    <DiffObservedFileHeaderRow
      borderColor={presentation.borderColor}
      collapsedFileIndexes$={collapsedFileIndexes$}
      fallbackFileIndex={fileIndex}
      fallbackPath={file?.path ?? ""}
      file={file}
      fileHeaderBackgroundColor={presentation.fileHeaderBackgroundColor}
      fontFamily={presentation.fontFamily}
      fontSize={presentation.fontSize}
      foregroundColor={presentation.foregroundColor}
      mutedColor={presentation.mutedColor}
      onToggleFileCollapsed={onToggleFileCollapsed}
      syntaxAppearance={presentation.syntaxAppearance}
    />
  );
});

const DiffSideBySideHunkHeaderRow = memo(function DiffSideBySideHunkHeaderRow({
  index,
  rowRender$,
  row,
}: DiffSideBySideRowProps) {
  const hunkHeader = useValue(() => {
    const collapsedFileIndexList = rowRender$.document.collapsedFileIndexList.get();
    const document = rowRender$.document.current.get() as DiffDocument | null;
    const sideBySideRowCount = rowRender$.document.sideBySideRowCount.get();
    const displayRow = row ?? (document ? document.getPlainSideBySideRow(index, [...collapsedFileIndexList]) : undefined);
    return {
      borderColor: rowRender$.presentation.borderColor.get(),
      fontFamily: rowRender$.presentation.fontFamily.get(),
      fontSize: rowRender$.presentation.fontSize.get(),
      hunkHeaderBackgroundColor: rowRender$.presentation.hunkHeaderBackgroundColor.get(),
      info: getDiffSideBySideHunkHeaderInfo(document, index, collapsedFileIndexList, sideBySideRowCount, displayRow),
      mutedColor: rowRender$.presentation.mutedColor.get(),
    };
  });

  return hunkHeader.info ? (
    <DiffHunkHeader
      borderColor={hunkHeader.borderColor}
      fontFamily={hunkHeader.fontFamily}
      fontSize={hunkHeader.fontSize}
      hunkHeaderBackgroundColor={hunkHeader.hunkHeaderBackgroundColor}
      info={hunkHeader.info}
      mutedColor={hunkHeader.mutedColor}
    />
  ) : null;
});

const DiffSideBySideLineRow = memo(function DiffSideBySideLineRow(props: DiffSideBySideRowProps) {
  const { adaptiveRender, hasHunkHeader, index, nativeConfigId, nativeRowHeight } = props;
  return (
    <>
      {hasHunkHeader ? <DiffSideBySideHunkHeaderRow {...props} /> : null}
      <DiffNativeSideBySideLineRow
        adaptiveRender={adaptiveRender}
        index={index}
        nativeConfigId={nativeConfigId}
        nativeRowHeight={nativeRowHeight}
      />
    </>
  );
});

export const DiffSideBySideRow = memo(function DiffSideBySideRow(props: DiffSideBySideRowProps) {
  return props.isFileHeader
    ? <DiffSideBySideFileHeaderRow {...props} />
    : <DiffSideBySideLineRow {...props} />;
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
