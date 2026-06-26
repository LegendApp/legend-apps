import type {
  DiffFileSummary,
  DiffRenderRow,
  DiffSideBySideRenderRow,
} from "@legend-desktop/diff-parser";
import {
  LightText,
  sourceViewerCodeFontFamily,
  sourceViewerLineNumberWidth,
  sourceViewerRowHeight,
  TokenizedText,
  type SyntaxStyleMap,
} from "@legend-desktop/source-viewer";
import { SFSymbol } from "@legend-desktop/sf-symbol";
import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getFilename } from "../diffFiles";
import {
  diffChangeTypeAdd,
  diffChangeTypeRemove,
  diffRowKindFileHeader,
  diffSideBySideGutterWidth,
  diffSideBySideHorizontalPadding,
} from "./diffViewerConstants";
import {
  getDirectoryPath,
  getFilePathContext,
  getFileStatusPresentation,
} from "./diffFilePresentation";

export type DiffRenderFields = {
  borderColor: string;
  fileHeaderBackgroundColor: string;
  fileByIndex: ReadonlyMap<number, DiffFileSummary>;
  fileByRowStart: ReadonlyMap<number, DiffFileSummary>;
  fileHeaderRowIndexes: ReadonlySet<number>;
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  mutedColor: string;
  rowHeight: number;
  sideBySideTokenStyleById: SyntaxStyleMap;
  syntaxAppearance: "dark" | "light";
  tokenStyleById: SyntaxStyleMap;
  toggleFileCollapsed: (fileIndex: number) => void;
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

type DiffUnifiedRowProps = {
  adaptiveRender: "light" | "normal";
  collapsedFileIndexes$: Observable<Set<number>>;
  index: number;
  renderFields: DiffRenderFields;
  row: DiffRenderRow | undefined;
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
  fontFamily: string;
  fontSize: number;
  foregroundColor: string;
  mutedColor: string;
  row: DiffRenderRow;
  rowHeight: number;
  rowVisible: boolean;
  side: "new" | "old";
  syntaxAppearance: "dark" | "light";
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

function getDiffRowPalette(syntaxAppearance: "dark" | "light") {
  return syntaxAppearance === "dark" ? diffDarkPalette : diffLightPalette;
}

function areDiffSideBySideLinePropsEqual(previousProps: DiffSideBySideLineProps, nextProps: DiffSideBySideLineProps) {
  const sharedPropsAreEqual = previousProps.adaptiveRender === nextProps.adaptiveRender
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
  fontFamily,
  fontSize,
  foregroundColor,
  mutedColor,
  row,
  rowHeight,
  rowVisible,
  side,
  syntaxAppearance,
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

  return (
    <View
      style={[
        styles.sideLine,
        {
          backgroundColor: rowBackgroundColor,
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
        line={visibleRow}
        style={[styles.sideDiffText, { fontFamily, fontSize, lineHeight: rowHeight }]}
        tokenStyleById={tokenStyleById}
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
  const fileHeaderLineHeight = Math.max(18, fontSize + 8);
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
          <SFSymbol color={statusPresentation.color} name={statusPresentation.symbolName} size={12} />
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
  const mutedColor = renderFields.mutedColor;
  const rowHeight = renderFields.rowHeight;
  const syntaxAppearance = renderFields.syntaxAppearance;
  const tokenStyleById = renderFields.tokenStyleById;
  const toggleFileCollapsed = renderFields.toggleFileCollapsed;
  const collapsedFileIndexes = useValue(collapsedFileIndexes$);
  const changeType = row?.changeType ?? 0;
  const isAdd = changeType === diffChangeTypeAdd;
  const isRemove = changeType === diffChangeTypeRemove;
  const isChanged = isAdd || isRemove;
  const isFileHeader = row?.kind === diffRowKindFileHeader || fileHeaderRowIndexes.has(index);
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
      <DiffFileHeaderRow
        borderColor={borderColor}
        fallbackFileIndex={fileIndex}
        fallbackPath={row?.text ?? ""}
        file={file}
        fileHeaderBackgroundColor={fileHeaderBackgroundColor}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
        isCollapsed={collapsedFileIndexes.has(fileIndex)}
        mutedColor={mutedColor}
        onToggleFileCollapsed={toggleFileCollapsed}
        syntaxAppearance={syntaxAppearance}
      />
    );
  }

  return (
    <View style={[styles.diffRow, { backgroundColor: rowBackgroundColor, borderLeftColor: accentColor, height: rowHeight }]}>
      <LightText selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {row && row.oldLineNumber >= 0 ? row.oldLineNumber : ""}
      </LightText>
      <LightText selectable={false} style={[styles.lineNumber, { color: lineNumberColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {row && row.newLineNumber >= 0 ? row.newLineNumber : ""}
      </LightText>
      <LightText selectable={false} style={[styles.marker, { color: isChanged ? accentColor : mutedColor, fontFamily, fontSize, lineHeight: rowHeight }]}>
        {isFileHeader ? "" : marker}
      </LightText>
      <TokenizedText
        adaptiveRender={adaptiveRender}
        foregroundColor={foregroundColor}
        line={row}
        style={[styles.diffText, { fontFamily, fontSize, lineHeight: rowHeight }]}
        tokenStyleById={tokenStyleById}
      />
    </View>
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
  const mutedColor = renderFields.mutedColor;
  const rowHeight = renderFields.rowHeight;
  const sideBySideTokenStyleById = renderFields.sideBySideTokenStyleById;
  const syntaxAppearance = renderFields.syntaxAppearance;
  const toggleFileCollapsed = renderFields.toggleFileCollapsed;
  const collapsedFileIndexes = useValue(collapsedFileIndexes$);

  if (!row) {
    return <View style={{ height: rowHeight }} />;
  }

  if (row.kind === "file-header") {
    const file = fileByRowStart.get(row.sourceStart) ?? fileByIndex.get(row.fileIndex);
    const fileIndex = file?.index ?? index;
    return (
      <DiffFileHeaderRow
        borderColor={borderColor}
        fallbackFileIndex={fileIndex}
        fallbackPath={file?.path ?? ""}
        file={file}
        fileHeaderBackgroundColor={fileHeaderBackgroundColor}
        fontFamily={fontFamily}
        fontSize={fontSize}
        foregroundColor={foregroundColor}
        isCollapsed={collapsedFileIndexes.has(fileIndex)}
        mutedColor={mutedColor}
        onToggleFileCollapsed={toggleFileCollapsed}
        syntaxAppearance={syntaxAppearance}
      />
    );
  }

  return (
    <View style={[styles.sideBySideRow, { height: rowHeight }]}>
      <View style={styles.sidePane}>
        <DiffSideBySideLine
          adaptiveRender={adaptiveRender}
          fontFamily={fontFamily}
          fontSize={fontSize}
          foregroundColor={foregroundColor}
          mutedColor={mutedColor}
          row={row.oldRow}
          rowHeight={rowHeight}
          rowVisible={row.oldRowVisible}
          side="old"
          syntaxAppearance={syntaxAppearance}
          tokenStyleById={sideBySideTokenStyleById}
        />
      </View>
      <View style={[styles.sideConnectorColumn, { width: diffSideBySideGutterWidth }]}>
      </View>
      <View style={styles.sidePane}>
        <DiffSideBySideLine
          adaptiveRender={adaptiveRender}
          fontFamily={fontFamily}
          fontSize={fontSize}
          foregroundColor={foregroundColor}
          mutedColor={mutedColor}
          row={row.newRowEqualsOldRow ? row.oldRow : row.newRow}
          rowHeight={rowHeight}
          rowVisible={row.newRowVisible}
          side="new"
          syntaxAppearance={syntaxAppearance}
          tokenStyleById={sideBySideTokenStyleById}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  diffRow: {
    borderLeftWidth: 3,
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
  fileAdded: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  fileDisclosure: {
    alignItems: "center",
    justifyContent: "center",
    width: 20,
  },
  fileMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
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
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 8,
    height: 40,
    marginHorizontal: 12,
    marginVertical: 6,
    paddingHorizontal: 10,
  },
  fileStatusIcon: {
    alignItems: "center",
    borderRadius: 4,
    height: 16,
    justifyContent: "center",
    width: 16,
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
    paddingHorizontal: 8,
    textAlign: "right",
    width: sourceViewerLineNumberWidth,
  },
  marker: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    textAlign: "center",
    width: 28,
  },
  sideBySideRow: {
    flexDirection: "row",
    minHeight: 0,
  },
  sideConnectorColumn: {
    alignItems: "center",
    justifyContent: "center",
  },
  sideDiffText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
    paddingRight: diffSideBySideHorizontalPadding,
  },
  sideLine: {
    flexDirection: "row",
    overflow: "hidden",
  },
  sideLineNumber: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    paddingLeft: 8,
    paddingRight: 6,
    textAlign: "right",
    width: 58,
  },
  sideMarker: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    textAlign: "center",
    width: 18,
  },
  sidePane: {
    flex: 1,
    minWidth: 0,
  },
});
