import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, PlatformColor, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { DiffNativeRow, DiffNativeRowConfig, diffUnifiedChangeBarWidth, diffUnifiedLineNumberWidth, diffUnifiedMarkerWidth, getDiffRowPalette, loadUnifiedDiff, type DiffDocument, type DiffRenderRow } from "@legend-apps/diff-parser";
import { unifiedPatchHunkKeys, unifiedPatchLineKey } from "@legend-apps/diff-parser/src/unifiedPatch";
import { Button } from "@legendapp/spark/ui";
import type { ChangesState } from "./gitChanges";

const rowHeight = 20;
const fontFamily = "Menlo";
const changeTypeKind: Record<number, "+" | "-"> = { 1: "+", 2: "-" };

export type DiffPaneItem = { type: "hunk"; hunkIndex: number } | { type: "line"; row: DiffRenderRow; key: string | null };

export const rowKey = (row: DiffRenderRow) => {
  const kind = changeTypeKind[row.changeType];
  return kind ? unifiedPatchLineKey({ kind, oldLine: row.oldLineNumber, newLine: row.newLineNumber }) : null;
};

export function diffPaneItems(rows: readonly DiffRenderRow[]): DiffPaneItem[] {
  const items: DiffPaneItem[] = [];
  let hunk = -1;
  for (const row of rows) {
    if (row.hunkIndex < 0) continue;
    if (row.hunkIndex !== hunk) items.push({ type: "hunk", hunkIndex: hunk = row.hunkIndex });
    items.push({ type: "line", row, key: rowKey(row) });
  }
  return items;
}

/** Click selects a changed line, Shift-click extends from the anchor, Command-click toggles. */
export function nextLineSelection(items: readonly DiffPaneItem[], selected: ReadonlySet<string>, anchor: number | null, index: number, modifiers: { shift?: boolean; meta?: boolean }) {
  const item = items[index];
  if (item?.type !== "line" || !item.key) return { selected, anchor };
  if (modifiers.shift && anchor !== null) {
    const keys = items.slice(Math.min(anchor, index), Math.max(anchor, index) + 1).flatMap(entry => entry.type === "line" && entry.key ? [entry.key] : []);
    return { selected: new Set(keys), anchor };
  }
  if (modifiers.meta) {
    const next = new Set(selected);
    if (!next.delete(item.key)) next.add(item.key);
    return { selected: next, anchor: index };
  }
  return { selected: new Set([item.key]), anchor: index };
}

export function DiffPane({ patch, disabled, readOnly = false, onApply, applyRef, onDiscard, discardRef }: {
  patch: NonNullable<ChangesState["patch"]>; disabled: boolean;
  /** History: no staging or discard actions and no line selection. */
  readOnly?: boolean; onApply: (keys: ReadonlySet<string>, text: string) => void; applyRef?: { current: (() => void) | null };
  /** Unstaged side only: asks to discard the keys from the worktree. */
  onDiscard?: (keys: ReadonlySet<string>, text: string, what: string) => void; discardRef?: { current: (() => void) | null };
}) {
  const appearance = useColorScheme() === "dark" ? "dark" : "light";
  const [loaded, setLoaded] = useState<{ text: string; document: DiffDocument; rows: DiffRenderRow[] } | null>(null);
  const document = useRef<DiffDocument | null>(null);
  const replaceDocument = (next: DiffDocument | null) => { document.current?.releaseNativeResources(); document.current = next; };
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ selected: ReadonlySet<string>; anchor: number | null }>({ selected: new Set(), anchor: null });
  const staged = patch.section === "staged";
  const verb = staged ? "Unstage" : "Stage";
  const discard = staged || readOnly ? undefined : onDiscard;
  const linesLabel = (count: number) => count === 1 ? "1 selected line" : `${count} selected lines`;

  useEffect(() => {
    let cancelled = false;
    setSelection({ selected: new Set(), anchor: null });
    setError(null);
    if (!patch.file?.hunks.length) { replaceDocument(null); setLoaded(null); return; }
    loadUnifiedDiff(patch.text, patch.path, 10_000).then(result => {
      if (cancelled) { result.document.releaseNativeResources(); return; }
      replaceDocument(result.document);
      setLoaded({ text: patch.text, document: result.document, rows: result.document.getPlainRows(0, result.document.rowCount) });
    }, (reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; };
  }, [patch.text, patch.path, patch.section]); // eslint-disable-line react-hooks/exhaustive-deps -- patch.file is derived from patch.text
  useEffect(() => () => replaceDocument(null), []);

  const items = useMemo(() => loaded?.text === patch.text ? diffPaneItems(loaded.rows) : [], [loaded, patch.text]);
  const palette = getDiffRowPalette(appearance);
  const configId = `git:${loaded?.document.documentId ?? 0}:unified`;
  const foregroundColor = appearance === "dark" ? "#e6edf3" : "#1f2328";
  const mutedColor = appearance === "dark" ? "#8b949e" : "#6e7781";
  const selected = selection.selected;
  useEffect(() => {
    if (!applyRef) return;
    applyRef.current = () => { if (!disabled && selected.size) onApply(selected, patch.text); };
    return () => { applyRef.current = null; };
  }, [applyRef, disabled, onApply, selected, patch.text]);
  useEffect(() => {
    if (!discardRef) return;
    discardRef.current = () => { if (!disabled && selected.size) discard?.(selected, patch.text, linesLabel(selected.size)); };
    return () => { discardRef.current = null; };
  });
  const message = patch.conflicted ? "This file has merge conflicts. Resolve them in the file, then stage the whole file to mark it resolved."
    : patch.file?.binary ? readOnly ? "Binary file." : `Binary file. ${verb}${discard ? " or discard" : ""} the whole file from the list.`
    : !patch.file ? "No changes to show."
    : !patch.file.hunks.length ? readOnly ? "No content changes (mode or rename only)." : `No content changes. ${verb} the whole file to include mode or rename changes.`
    : error;

  return <View style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.path} numberOfLines={1}>{patch.path}</Text>
      {discard ? <Button style={styles.action} disabled={disabled || !selected.size || !!message} onPress={() => discard(selected, patch.text, linesLabel(selected.size))}>Discard Lines…</Button> : null}
      {readOnly ? null : <Button style={styles.action} disabled={disabled || !selected.size} onPress={() => onApply(selected, patch.text)}>{`${verb} Lines`}</Button>}
    </View>
    {message ? <Text style={styles.message}>{message}</Text> : loaded && <>
      <DiffNativeRowConfig
        style={styles.config} collapsable={false} configId={configId} configVersion={appearance === "dark" ? 2 : 1} documentId={loaded.document.documentId}
        presentation="unified" projectionId={0} collapsedFileIndexes="" rowHeight={rowHeight} fontFamily={fontFamily} fontSize={12}
        foregroundColor={foregroundColor} mutedColor={mutedColor} dividerColor="transparent"
        addAccentColor={palette.addAccent} addBackgroundColor={palette.addBackground} removeAccentColor={palette.removeAccent} removeBackgroundColor={palette.removeBackground}
        changeBarWidth={diffUnifiedChangeBarWidth} lineNumberWidth={diffUnifiedLineNumberWidth} markerWidth={diffUnifiedMarkerWidth}
        highlightChangedCharacters showWhitespaceCharacters={false} syntaxHighlightingEnabled={false} themeName="" horizontalViewportWidth={0}
        searchHighlightByRowIndex="" activeSearchHighlightByRowIndex="" searchHighlightColor="transparent" activeSearchHighlightColor="transparent" activeSearchRowHighlightColor="transparent"
        tokenizationVersion={0} tokenizedRowRanges="" />
      <FlatList
        data={items}
        keyExtractor={(item, index) => item.type === "hunk" ? `hunk:${item.hunkIndex}` : `row:${item.row.index}:${index}`}
        renderItem={({ item, index }) => item.type === "hunk" ? <View style={styles.hunk}>
          <Text style={[styles.hunkTitle, { fontFamily }]}>Hunk {item.hunkIndex + 1}</Text>
          {discard ? <Button style={styles.action} disabled={disabled} onPress={() => discard(new Set(unifiedPatchHunkKeys(patch.file!.hunks[item.hunkIndex]!)), patch.text, `hunk ${item.hunkIndex + 1} of “${patch.path}”`)}>Discard Hunk…</Button> : null}
          {readOnly ? null : <Button style={styles.action} disabled={disabled} onPress={() => onApply(new Set(unifiedPatchHunkKeys(patch.file!.hunks[item.hunkIndex]!)), patch.text)}>{`${verb} Hunk`}</Button>}
        </View> : readOnly ? <DiffNativeRow adaptiveRender="normal" configId={configId} itemId={item.row.index} rowIndex={item.row.index} style={styles.row} /> : <Pressable
          accessibilityRole="button" accessibilityLabel={`${item.row.changeType === 1 ? "Added" : item.row.changeType === 2 ? "Removed" : "Context"} line ${item.row.text}`}
          accessibilityState={{ selected: !!item.key && selected.has(item.key) }}
          accessibilityActions={item.key ? [{ name: "activate" }] : undefined}
          onAccessibilityAction={() => setSelection(state => nextLineSelection(items, state.selected, state.anchor, index, { meta: true }))}
          onPress={event => {
            const native = event.nativeEvent as { shiftKey?: boolean; metaKey?: boolean };
            setSelection(state => nextLineSelection(items, state.selected, state.anchor, index, { shift: native.shiftKey, meta: native.metaKey }));
          }}>
          <DiffNativeRow adaptiveRender="normal" configId={configId} itemId={item.row.index} rowIndex={item.row.index} style={styles.row} />
          {/* The overlay takes the hit so the native row's text-selection tracking doesn't swallow the click. */}
          <View style={[styles.hitTarget, item.key && selected.has(item.key) && styles.selected]} />
        </Pressable>}
      />
    </>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor") },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  path: { flex: 1, fontSize: 13, fontWeight: "600", color: PlatformColor("labelColor") },
  action: { width: 110, height: 24 },
  message: { padding: 16, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
  config: { width: 0, height: 0, overflow: "hidden" },
  hunk: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 32, backgroundColor: PlatformColor("underPageBackgroundColor") },
  hunkTitle: { flex: 1, fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  row: { width: "100%", height: rowHeight },
  hitTarget: { ...StyleSheet.absoluteFillObject },
  selected: { backgroundColor: PlatformColor("selectedContentBackgroundColor"), opacity: 0.28 },
});
