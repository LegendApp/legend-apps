import type {
  DiffDocument,
  DiffFileSummary,
  DiffRenderRow,
  DiffSideBySideFileHeader,
  DiffSideBySideRenderRow,
} from "@legend-desktop/diff-parser";
import { DiffNativeRow } from "@legend-desktop/diff-parser";
import {
  LightText,
  sourceViewerCodeFontFamily,
  sourceViewerRowHeight,
  TokenizedText,
  type SyntaxStyleMap,
} from "@legend-desktop/source-viewer";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { memo, useMemo, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getFilename } from "../diffFiles";
import type { DiffRowRendererSetting } from "../diffSettings";
import {
  diffChangeTypeAdd,
  diffChangeTypeRemove,
  diffFileHeaderRowHeight,
  diffRowKindFileHeader,
  diffSideBySideHorizontalPadding,
} from "./diffViewerConstants";
import {
  getDirectoryPath,
  getFilePathContext,
  getFileStatusPresentation,
} from "./diffFilePresentation";

export type DiffRenderFields = {
  borderColor: string;
  collapsedFileIndexList: readonly number[];
  document: DiffDocument | null;
  fileHeaderBackgroundColor: string;
  fileByIndex: ReadonlyMap<number, DiffFileSummary>;
  fileByRowStart: ReadonlyMap<number, DiffFileSummary>;
  fileHeaderRowIndexes: ReadonlySet<number>;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  hunkHeaderBackgroundColor: string;
  mutedColor: string;
  nativeSideBySideRowConfigId: string;
  nativeSideBySideRowConfigVersion: number;
  nativeUnifiedRowConfigId: string;
  nativeUnifiedRowConfigVersion: number;
  rowRenderer: DiffRowRendererSetting;
  rowHeight: number;
  showOnlyHunks: boolean;
  sideBySideFileHeaderByListIndex: ReadonlyMap<number, DiffSideBySideFileHeader>;
  sideBySideRowCount: number;
  sideBySideTokenStyleById: SyntaxStyleMap;
  syntaxAppearance: "dark" | "light";
  syntaxHighlightingEnabled: boolean;
  syntaxStyleStore: DiffSyntaxStyleStore;
  syntaxThemeName: string;
  tokenStyleById: SyntaxStyleMap;
  toggleFileCollapsed: (fileIndex: number) => void;
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
  renderFields: DiffRenderFields;
  row: DiffRenderRow | undefined;
};

type DiffReactNativeUnifiedLineRowProps = {
  accentColor: string;
  adaptiveRender: "normal";
  isChanged: boolean;
  lineNumberColor: string;
  marker: string;
  renderFields: DiffRenderFields;
  row: DiffRenderRow | undefined;
  rowBackgroundColor: string;
};

type DiffSideBySideRowProps = {
  adaptiveRender: "light" | "normal";
  collapsedFileIndexes$: Observable<Set<number>>;
  index: number;
  renderFields: DiffRenderFields;
  row: DiffSideBySideRenderRow | undefined;
};

type DiffSideBySideLineProps = {
  adaptiveRender: "light" | "normal";
  borderColor?: string;
  document: DiffDocument | null;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  mutedColor: string;
  row: DiffRenderRow;
  rowHeight: number;
  rowVisible: boolean;
  side: "new" | "old";
  syntaxAppearance: "dark" | "light";
  syntaxStyleStore: DiffSyntaxStyleStore;
  tokenStyleById: SyntaxStyleMap;
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
const diffUnifiedLightPaddingLeft = diffUnifiedChangeBarWidth + diffUnifiedLineNumberWidth * 2 + diffUnifiedMarkerWidth;
export const diffSideBySideLineNumberWidth = 40;
export const diffSideBySideMarkerWidth = 12;
const diffSideBySideLightPaddingLeft = diffSideBySideLineNumberWidth + diffSideBySideMarkerWidth;
export const diffHunkHeaderHeight = 32;

export function getDiffRowPalette(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark" ? diffDarkPalette : diffLightPalette;
}

export function getSideBySideDividerColor(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark" ? "#ffffff14" : "#1118271a";
}

type TokenizedDiffRowState = {
  row: DiffRenderRow;
  tokenStyleById: SyntaxStyleMap;
};

export type DiffSyntaxStyleStore = {
  current: SyntaxStyleMap;
  getSnapshot: () => number;
  refresh: (document: DiffDocument) => void;
  subscribe: (listener: () => void) => () => void;
};

function useTokenizedDiffRow(
  document: DiffDocument | null,
  row: DiffRenderRow | undefined,
  adaptiveRender: "light" | "normal",
  syntaxStyleStore: DiffSyntaxStyleStore,
) {
  const tokenizedMaxRow = useSyncExternalStore(
    syntaxStyleStore.subscribe,
    syntaxStyleStore.getSnapshot,
    syntaxStyleStore.getSnapshot,
  );
  const rowIndex = row?.index ?? -1;
  const shouldTokenize = adaptiveRender === "normal" && document !== null && row !== undefined && row.kind !== diffRowKindFileHeader;

  return useMemo<TokenizedDiffRowState | null>(() => {
    if (shouldTokenize && document && rowIndex >= 0 && rowIndex < tokenizedMaxRow) {
      const cachedRow = document.getRow(rowIndex);
      if (cachedRow.tokens !== null) {
        return {
          row: {
            ...cachedRow.plain,
            tokens: cachedRow.tokens,
          },
          tokenStyleById: syntaxStyleStore.current,
        };
      }
    }
    return null;
  }, [document, rowIndex, shouldTokenize, syntaxStyleStore, tokenizedMaxRow]);
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
  renderFields,
}: {
  adaptiveRender: "light" | "normal";
  index: number;
  renderFields: DiffRenderFields;
}) {
  return (
    <DiffNativeRow
      adaptiveRender={adaptiveRender}
      configId={renderFields.nativeUnifiedRowConfigId}
      configVersion={renderFields.nativeUnifiedRowConfigVersion}
      rowIndex={index}
      style={[styles.nativeDiffRow, { height: renderFields.rowHeight }]}
    />
  );
}

function DiffNativeSideBySideLineRow({
  adaptiveRender,
  index,
  renderFields,
}: {
  adaptiveRender: "light" | "normal";
  index: number;
  renderFields: DiffRenderFields;
}) {
  return (
    <DiffNativeRow
      adaptiveRender={adaptiveRender}
      configId={renderFields.nativeSideBySideRowConfigId}
      configVersion={renderFields.nativeSideBySideRowConfigVersion}
      rowIndex={index}
      style={[styles.nativeDiffRow, { height: renderFields.rowHeight }]}
    />
  );
}

function areDiffSideBySideLinePropsEqual(previousProps: DiffSideBySideLineProps, nextProps: DiffSideBySideLineProps) {
  const sharedPropsAreEqual = previousProps.adaptiveRender === nextProps.adaptiveRender
    && previousProps.borderColor === nextProps.borderColor
    && previousProps.fontFamily === nextProps.fontFamily
    && previousProps.fontSize === nextProps.fontSize
    && previousProps.foregroundColor === nextProps.foregroundColor
    && previousProps.mutedColor === nextProps.mutedColor
    && previousProps.rowHeight === nextProps.rowHeight
    && previousProps.rowVisible === nextProps.rowVisible
    && previousProps.side === nextProps.side
    && previousProps.syntaxAppearance === nextProps.syntaxAppearance
    && previousProps.tokenStyleById === nextProps.tokenStyleById;

  return sharedPropsAreEqual
    && (!nextProps.rowVisible || previousProps.row === nextProps.row);
}

const DiffSideBySideLine = memo(function DiffSideBySideLine({
  adaptiveRender,
  borderColor,
  document,
  fontFamily,
  fontSize,
  foregroundColor,
  mutedColor,
  row,
  rowHeight,
  rowVisible,
  side,
  syntaxAppearance,
  syntaxStyleStore,
  tokenStyleById,
}: DiffSideBySideLineProps) {
  const visibleRow = rowVisible ? row : undefined;
  const isRemove = side === "old" && visibleRow?.changeType === diffChangeTypeRemove;
  const isAdd = side === "new" && visibleRow?.changeType === diffChangeTypeAdd;
  const isChanged = isRemove || isAdd;
  const marker = isRemove ? "-" : isAdd ? "+" : " ";
  const palette = getDiffRowPalette(syntaxAppearance);
  const accentColor = isAdd ? palette.addAccent : isRemove ? palette.removeAccent : "transparent";
  const rowBackgroundColor = isAdd
    ? palette.addBackground
    : isRemove
      ? palette.removeBackground
      : "transparent";
  const lineNumber = side === "old" ? visibleRow?.oldLineNumber : visibleRow?.newLineNumber;
  const tokenizedState = useTokenizedDiffRow(document, visibleRow, adaptiveRender, syntaxStyleStore);
  const displayRow = tokenizedState?.row ?? visibleRow;
  const displayTokenStyleById = tokenizedState?.tokenStyleById ?? tokenStyleById;

  if (adaptiveRender === "light") {
    return (
      <LightText
        selectable={false}
        style={[
          styles.sideLightLine,
          borderColor ? styles.sideLineDivider : null,
          {
            backgroundColor: rowBackgroundColor,
            borderLeftColor: borderColor,
            color: foregroundColor,
            fontFamily,
            fontSize,
            height: rowHeight,
            lineHeight: rowHeight,
          },
        ]}
      >
        {visibleRow?.text ?? ""}
      </LightText>
    );
  }

  return (
    <View
      style={[
        styles.sideLine,
        borderColor ? styles.sideLineDivider : null,
        {
          backgroundColor: rowBackgroundColor,
          borderLeftColor: borderColor,
          height: rowHeight,
        },
      ]}
    >
      <LightText selectable={false} style={[styles.sideLineNumber, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {lineNumber !== undefined && lineNumber >= 0 ? lineNumber : ""}
      </LightText>
      <LightText selectable={false} style={[styles.sideMarker, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {visibleRow ? marker : ""}
      </LightText>
      <TokenizedText
        adaptiveRender={adaptiveRender}
        foregroundColor={foregroundColor}
        line={displayRow}
        style={[styles.sideDiffText, { fontFamily, fontSize, lineHeight: rowHeight }]}
        tokenStyleById={displayTokenStyleById}
      />
    </View>
  );
}, areDiffSideBySideLinePropsEqual);

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
          {!file.isBinary ? (
            <>
              <Text selectable={false} style={[styles.fileAdded, { color: palette.addAccent, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                +{file.additions}
              </Text>
              <Text selectable={false} style={[styles.fileRemoved, { color: palette.removeAccent, fontFamily, fontSize, lineHeight: fileHeaderLineHeight }]}>
                -{file.deletions}
              </Text>
            </>
          ) : null}
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

const DiffReactNativeUnifiedLineRow = memo(function DiffReactNativeUnifiedLineRow({
  accentColor,
  adaptiveRender,
  isChanged,
  lineNumberColor,
  marker,
  renderFields,
  row,
  rowBackgroundColor,
}: DiffReactNativeUnifiedLineRowProps) {
  const fontFamily = renderFields.fontFamily;
  const fontSize = renderFields.fontSize;
  const foregroundColor = renderFields.foregroundColor;
  const mutedColor = renderFields.mutedColor;
  const rowHeight = renderFields.rowHeight;
  const tokenizedState = useTokenizedDiffRow(renderFields.document, row, adaptiveRender, renderFields.syntaxStyleStore);
  const displayRow = tokenizedState?.row ?? row;
  const displayTokenStyleById = tokenizedState?.tokenStyleById ?? renderFields.tokenStyleById;

  return (
    <View style={[styles.diffRow, { backgroundColor: rowBackgroundColor, borderLeftColor: accentColor, height: rowHeight }]}>
      <LightText selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {row && row.oldLineNumber >= 0 ? row.oldLineNumber : ""}
      </LightText>
      <LightText selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {row && row.newLineNumber >= 0 ? row.newLineNumber : ""}
      </LightText>
      <LightText selectable={false} style={[styles.marker, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {marker}
      </LightText>
      <TokenizedText
        adaptiveRender={adaptiveRender}
        foregroundColor={foregroundColor}
        line={displayRow}
        style={[styles.diffText, { fontFamily, fontSize, lineHeight: rowHeight }]}
        tokenStyleById={displayTokenStyleById}
      />
    </View>
  );
});

export const DiffUnifiedRow = memo(function DiffUnifiedRow({
  adaptiveRender,
  collapsedFileIndexes$,
  index,
  renderFields,
  row,
}: DiffUnifiedRowProps) {
  const borderColor = renderFields.borderColor;
  const fileHeaderBackgroundColor = renderFields.fileHeaderBackgroundColor;
  const fileByIndex = renderFields.fileByIndex;
  const fileByRowStart = renderFields.fileByRowStart;
  const fileHeaderRowIndexes = renderFields.fileHeaderRowIndexes;
  const fontFamily = renderFields.fontFamily;
  const fontSize = renderFields.fontSize;
  const foregroundColor = renderFields.foregroundColor;
  const hunkHeaderBackgroundColor = renderFields.hunkHeaderBackgroundColor;
  const mutedColor = renderFields.mutedColor;
  const rowHeight = renderFields.rowHeight;
  const syntaxAppearance = renderFields.syntaxAppearance;
  const toggleFileCollapsed = renderFields.toggleFileCollapsed;
  const changeType = row?.changeType ?? 0;
  const isAdd = changeType === diffChangeTypeAdd;
  const isRemove = changeType === diffChangeTypeRemove;
  const isChanged = isAdd || isRemove;
  const isFileHeader = row?.kind === diffRowKindFileHeader || fileHeaderRowIndexes.has(index);
  const displayRow = row ?? (
    renderFields.rowRenderer === "native" && renderFields.document && !isFileHeader
      ? getPlainUnifiedRow(renderFields.document, index)
      : undefined
  );
  const hunkHeaderInfo = renderFields.showOnlyHunks
    ? getDiffUnifiedHunkHeaderInfo(renderFields.document, index, displayRow)
    : null;
  const file = row ? fileByIndex.get(row.fileIndex) : fileByRowStart.get(index);
  const palette = getDiffRowPalette(syntaxAppearance);
  const accentColor = isAdd ? palette.addAccent : isRemove ? palette.removeAccent : "transparent";
  const rowBackgroundColor = isAdd
    ? palette.addBackground
    : isRemove
      ? palette.removeBackground
      : "transparent";
  const lineNumberColor = isChanged ? accentColor : mutedColor;
  const marker = isAdd ? "+" : isRemove ? "-" : " ";

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
        onToggleFileCollapsed={toggleFileCollapsed}
        syntaxAppearance={syntaxAppearance}
      />
    );
  }

  if (renderFields.rowRenderer === "native" && renderFields.document) {
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
        <DiffNativeUnifiedLineRow
          adaptiveRender={adaptiveRender}
          index={index}
          renderFields={renderFields}
        />
      </>
    );
  }

  if (adaptiveRender === "light") {
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
        <LightText
          selectable={false}
          style={[
            styles.lightDiffRow,
            {
              backgroundColor: rowBackgroundColor,
              color: foregroundColor,
              fontFamily,
              fontSize,
              height: rowHeight,
              lineHeight: rowHeight,
            },
          ]}
        >
          {row?.text ?? ""}
        </LightText>
      </>
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
      <DiffReactNativeUnifiedLineRow
        accentColor={accentColor}
        adaptiveRender="normal"
        isChanged={isChanged}
        lineNumberColor={lineNumberColor}
        marker={marker}
        renderFields={renderFields}
        row={row}
        rowBackgroundColor={rowBackgroundColor}
      />
    </>
  );
});

export const DiffSideBySideRow = memo(function DiffSideBySideRow({
  adaptiveRender,
  collapsedFileIndexes$,
  index,
  renderFields,
  row,
}: DiffSideBySideRowProps) {
  const borderColor = renderFields.borderColor;
  const fileHeaderBackgroundColor = renderFields.fileHeaderBackgroundColor;
  const fileByIndex = renderFields.fileByIndex;
  const fileByRowStart = renderFields.fileByRowStart;
  const fontFamily = renderFields.fontFamily;
  const fontSize = renderFields.fontSize;
  const foregroundColor = renderFields.foregroundColor;
  const hunkHeaderBackgroundColor = renderFields.hunkHeaderBackgroundColor;
  const mutedColor = renderFields.mutedColor;
  const rowHeight = renderFields.rowHeight;
  const sideBySideTokenStyleById = renderFields.sideBySideTokenStyleById;
  const syntaxAppearance = renderFields.syntaxAppearance;
  const syntaxStyleStore = renderFields.syntaxStyleStore;
  const toggleFileCollapsed = renderFields.toggleFileCollapsed;
  const sideBySideDividerColor = getSideBySideDividerColor(syntaxAppearance);
  const displayRow = row ?? (
    renderFields.rowRenderer === "native" && renderFields.document
      ? renderFields.document.getPlainSideBySideRow(index, [...renderFields.collapsedFileIndexList])
      : undefined
  );
  const fileHeader = row?.kind === "file-header"
    ? { fileIndex: row.fileIndex, sourceStart: row.sourceStart }
    : renderFields.sideBySideFileHeaderByListIndex.get(index);
  const hunkHeaderInfo = renderFields.showOnlyHunks
    ? getDiffSideBySideHunkHeaderInfo(
        renderFields.document,
        index,
        renderFields.collapsedFileIndexList,
        renderFields.sideBySideRowCount,
        displayRow,
      )
    : null;

  if (!row && !fileHeader && renderFields.rowRenderer !== "native") {
    return <View style={{ height: rowHeight }} />;
  }

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
        onToggleFileCollapsed={toggleFileCollapsed}
        syntaxAppearance={syntaxAppearance}
      />
    );
  }

  if (renderFields.rowRenderer === "native" && renderFields.document) {
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
        <DiffNativeSideBySideLineRow
          adaptiveRender={adaptiveRender}
          index={index}
          renderFields={renderFields}
        />
      </>
    );
  }

  if (!row) {
    return <View style={{ height: rowHeight }} />;
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
      <View style={[styles.sideBySideRow, { height: rowHeight }]}>
        <DiffSideBySideLine
          adaptiveRender={adaptiveRender}
          document={renderFields.document}
          fontFamily={fontFamily}
          fontSize={fontSize}
          foregroundColor={foregroundColor}
          mutedColor={mutedColor}
          row={row.oldRow}
          rowHeight={rowHeight}
          rowVisible={row.oldRowVisible}
          side="old"
          syntaxAppearance={syntaxAppearance}
          syntaxStyleStore={syntaxStyleStore}
          tokenStyleById={sideBySideTokenStyleById}
        />
        <DiffSideBySideLine
          adaptiveRender={adaptiveRender}
          borderColor={sideBySideDividerColor}
          document={renderFields.document}
          fontFamily={fontFamily}
          fontSize={fontSize}
          foregroundColor={foregroundColor}
          mutedColor={mutedColor}
          row={row.newRowEqualsOldRow ? row.oldRow : row.newRow}
          rowHeight={rowHeight}
          rowVisible={row.newRowVisible}
          side="new"
          syntaxAppearance={syntaxAppearance}
          syntaxStyleStore={syntaxStyleStore}
          tokenStyleById={sideBySideTokenStyleById}
        />
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  diffRow: {
    borderLeftWidth: diffUnifiedChangeBarWidth,
    flexDirection: "row",
    height: sourceViewerRowHeight,
  },
  diffText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
    paddingRight: 12,
  },
  lightDiffRow: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
    paddingLeft: diffUnifiedLightPaddingLeft,
    paddingRight: 12,
  },
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
  lineNumber: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    paddingLeft: 4,
    paddingRight: 4,
    textAlign: "right",
    width: diffUnifiedLineNumberWidth,
  },
  marker: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    textAlign: "center",
    width: diffUnifiedMarkerWidth,
  },
  nativeDiffRow: {
    width: "100%",
  },
  sideBySideRow: {
    flexDirection: "row",
    minHeight: 0,
  },
  sideDiffText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
    paddingRight: diffSideBySideHorizontalPadding,
  },
  sideLightLine: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    minWidth: 0,
    overflow: "hidden",
    paddingLeft: diffSideBySideLightPaddingLeft,
    paddingRight: diffSideBySideHorizontalPadding,
  },
  sideLine: {
    flex: 1,
    flexDirection: "row",
    minWidth: 0,
    overflow: "hidden",
  },
  sideLineDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  sideLineNumber: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    paddingLeft: 4,
    paddingRight: 4,
    textAlign: "right",
    width: diffSideBySideLineNumberWidth,
  },
  sideMarker: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    textAlign: "center",
    width: diffSideBySideMarkerWidth,
  },
});
