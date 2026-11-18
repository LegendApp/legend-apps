import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { FlatList, PlatformColor, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, type GestureResponderEvent } from "react-native";
import type { ConflictRegion, ConflictRegionSide } from "@legend-apps/git-core";
import { DiffNativeRow, DiffNativeRowConfig, diffUnifiedChangeBarWidth, diffUnifiedLineNumberWidth, diffUnifiedMarkerWidth, getDiffRowPalette, type DiffDocument, type DiffRenderRow } from "@legend-apps/diff-parser";
import { createDiffDocumentCache, DiffDocumentCacheContext } from "./layout/diffDocuments";
import { unifiedPatchHunkKeys, unifiedPatchLineKey } from "@legend-apps/diff-parser/src/unifiedPatch";
import { Button } from "@legendapp/spark/ui";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { SourceDocumentEditor } from "@legend-apps/source-editor";
import { draftDirty, resultLineKinds, type ResultDraft, type ResultDraftStore, type TextEdit } from "./resultDraft";
import { rowAnchorKeys } from "./reviewThreads";
import type { ChangesState } from "./gitChanges";
import { pathParts, useSymbolColor } from "./FileRow";

const rowHeight = 20;
const fontFamily = "Menlo";
const changeTypeKind: Record<number, "+" | "-"> = { 1: "+", 2: "-" };

export type DiffPaneItem = { type: "hunk"; hunkIndex: number } | { type: "line"; row: DiffRenderRow; key: string | null };

/** A line of the diff: its side (removed lines are on the old side) and 1-based number there, and the file's path on that side. */
export type DiffLineTarget = { side: "old" | "new"; line: number; path: string };

/** The line a row stands for, or null for a row with no line number. */
export function lineTarget(row: DiffRenderRow, patch: { path: string; file: { oldPath?: string | null } | null }): DiffLineTarget | null {
  const removed = row.changeType === 2;
  const line = removed ? row.oldLineNumber : row.newLineNumber;
  if (!line || line < 1) return null;
  return { side: removed ? "old" : "new", line, path: removed ? patch.file?.oldPath ?? patch.path : patch.path };
}

type MouseDetails = { button?: number; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean; pageX?: number; pageY?: number };

export const rowKey = (row: DiffRenderRow) => {
  const kind = changeTypeKind[row.changeType];
  return kind ? unifiedPatchLineKey({ kind, oldLine: row.oldLineNumber, newLine: row.newLineNumber }) : null;
};

const hunkRange = (start: number, count: number) => count === 1 ? `${start}` : `${start},${count}`;
/** The hunk's own `@@ -a,b +c,d @@ section` line, as Git prints it (a count of 1 is omitted). */
export const hunkTitle = (hunk: { oldStart: number; oldCount: number; newStart: number; newCount: number; section: string }) =>
  `@@ -${hunkRange(hunk.oldStart, hunk.oldCount)} +${hunkRange(hunk.newStart, hunk.newCount)} @@${hunk.section}`;

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

/** The item indexes from the range anchor to the cursor, kept inside the cursor's hunk (a GitHub range can't span hunks). */
export function rangeBounds(items: readonly DiffPaneItem[], anchor: number | null, cursor: number | null) {
  const item = cursor === null ? undefined : items[cursor];
  if (cursor === null || item?.type !== "line") return null;
  let from = Math.min(anchor ?? cursor, cursor), to = Math.max(anchor ?? cursor, cursor);
  while (items[from]?.type !== "line" || (items[from] as { row: DiffRenderRow }).row.hunkIndex !== item.row.hunkIndex) from += 1;
  while (items[to]?.type !== "line" || (items[to] as { row: DiffRenderRow }).row.hunkIndex !== item.row.hunkIndex) to -= 1;
  return { from, to };
}

/**
 * The first and last lines of the readOnly selection (what Add Comment… acts on), in diff order. A range that ends on a
 * removed line starts on the old side when it starts on a context line, since GitHub reads both ends on one side then.
 */
export function lineRange(items: readonly DiffPaneItem[], anchor: number | null, cursor: number | null, patch: { path: string; file: { oldPath?: string | null } | null }) {
  const bounds = rangeBounds(items, anchor, cursor);
  if (!bounds) return null;
  const lines = items.slice(bounds.from, bounds.to + 1).flatMap(item => item.type === "line" && lineTarget(item.row, patch) ? [item.row] : []);
  const first = lines[0], last = lines[lines.length - 1];
  if (!first || !last) return null;
  const end = lineTarget(last, patch)!;
  const start = end.side === "old" && first.changeType !== 1 && first.changeType !== 2 && first.oldLineNumber > 0
    ? { side: "old" as const, line: first.oldLineNumber, path: patch.file?.oldPath ?? patch.path } : lineTarget(first, patch)!;
  return { start, end };
}

/** A conflict pick's button, sized to its label like Diff's buttons (labels name branches). */
export function PickButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Button style={{ height: 24, width: Math.max(64, Math.ceil(label.length * 7) + 28) }} disabled={disabled} onPress={onPress}>{label}</Button>;
}

const sideTint = {
  light: { ours: "rgba(9, 105, 218, 0.08)", oursBar: "rgba(9, 105, 218, 0.6)", theirs: "rgba(130, 80, 223, 0.08)", theirsBar: "rgba(130, 80, 223, 0.6)" },
  dark: { ours: "rgba(56, 139, 253, 0.14)", oursBar: "rgba(56, 139, 253, 0.7)", theirs: "rgba(163, 113, 247, 0.14)", theirsBar: "rgba(163, 113, 247, 0.7)" },
};

/** One conflict region: a header with its picks, then ours, the common ancestor when Git wrote it, and theirs. */
function ConflictRegionView({ region, index, count, labels, disabled, appearance, onPick }: {
  region: ConflictRegion; index: number; count: number; labels: { ours: string; theirs: string }; disabled: boolean; appearance: "light" | "dark";
  onPick: (side: ConflictRegionSide) => void;
}) {
  const tint = sideTint[appearance];
  const section = (title: string, lines: readonly string[], firstLine: number, color: string | null, bar: string | null) => <View>
    <Text style={styles.regionLabel} numberOfLines={1}>{title}</Text>
    <View style={[styles.regionLines, color ? { backgroundColor: color, borderLeftColor: bar! } : styles.regionBase]}>
      {lines.length ? lines.map((line, offset) => <View key={offset} style={styles.regionLine}>
        <Text style={[styles.regionNumber, { fontFamily }]}>{firstLine + offset}</Text>
        <Text style={[styles.regionText, { fontFamily }]} numberOfLines={1}>{line || " "}</Text>
      </View>) : <Text style={styles.regionEmpty}>No lines</Text>}
    </View>
  </View>;
  const oursAt = region.start + 2, baseAt = oursAt + region.ours.length + 1, theirsAt = (region.base ? baseAt + region.base.length : oursAt + region.ours.length) + 1;
  return <View style={styles.region}>
    <View style={styles.hunk}>
      <Text style={styles.hunkTitle} numberOfLines={1} accessibilityRole="header">{`Conflict ${index + 1} of ${count}, line ${region.start + 1}`}</Text>
      <PickButton label={`Use ${labels.ours}`} disabled={disabled} onPress={() => onPick("ours")} />
      <PickButton label={`Use ${labels.theirs}`} disabled={disabled} onPress={() => onPick("theirs")} />
      <PickButton label="Use Both" disabled={disabled} onPress={() => onPick("both")} />
    </View>
    {section(labels.ours, region.ours, oursAt, tint.ours, tint.oursBar)}
    {region.base ? section("Common ancestor", region.base, baseAt, null, null) : null}
    {section(labels.theirs, region.theirs, theirsAt, tint.theirs, tint.theirsBar)}
  </View>;
}

const resultTint = {
  light: { ...sideTint.light, marker: "rgba(207, 34, 46, 0.12)", base: "rgba(110, 119, 129, 0.10)" },
  dark: { ...sideTint.dark, marker: "rgba(248, 81, 73, 0.18)", base: "rgba(139, 148, 158, 0.14)" },
};

/** The editor for one draft version; it's seeded once, so a new version (Revert, a reload) remounts it. */
function ResultEditor({ draft, lineBackground, appearance, onEdit }: {
  draft: ResultDraft; lineBackground: (index: number) => string | undefined; appearance: "light" | "dark"; onEdit: (edit: TextEdit) => void;
}) {
  const [seed] = useState(draft.text);
  return <SourceDocumentEditor filePath={draft.path} initialSource={seed} fontSize={12} wrap={false} foreground={appearance === "dark" ? "#e6edf3" : "#1f2328"}
    syntaxHighlightingEnabled={false} showLanguageSelector={false} showFileLoadingBanner={false} lineBackground={lineBackground} onChange={onEdit} />;
}

/**
 * A conflicted file's worktree text, editable, with its conflict regions tinted. Save writes it to the file (refused when
 * the file changed since the edit began); Revert drops unsaved edits. Edits live in `store`, so they outlast this view.
 */
function ResultView({ path, disk, size, store, disabled, appearance, onSave }: {
  path: string; disk: string; size: number; store: ResultDraftStore; disabled: boolean; appearance: "light" | "dark";
  onSave: (draft: ResultDraft) => Promise<boolean>;
}) {
  const stored = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => { store.sync(path, disk); }, [store, path, disk]);
  const draft = stored?.path === path ? stored : null;
  const text = draft?.text ?? disk;
  const kinds = useMemo(() => resultLineKinds(text, size), [text, size]);
  const tint = resultTint[appearance];
  const lineBackground = useCallback((index: number) => { const kind = kinds[index]; return kind ? tint[kind] : undefined; }, [kinds, tint]);
  const dirty = draftDirty(draft), stale = !!draft?.stale;
  const status = stale ? "Result — the file changed since you began editing" : dirty ? "Result — edited" : "Result";
  return <View style={styles.result}>
    <View style={styles.hunk}>
      <Text style={styles.hunkTitle} numberOfLines={1} accessibilityRole="header">{status}</Text>
      <Button style={styles.resultAction} disabled={disabled || !dirty && !stale} onPress={() => store.revert(disk)}>Revert</Button>
      <Button style={styles.resultAction} disabled={disabled || !dirty || stale} onPress={() => void store.save(onSave)}>Save</Button>
    </View>
    {draft ? <ResultEditor key={`${path}:${draft.version}`} draft={draft} lineBackground={lineBackground} appearance={appearance} onEdit={edit => store.edit(draft.version, edit)} /> : null}
  </View>;
}

export function DiffPane({ patch, disabled, readOnly = false, accessory, onApply, applyRef, onDiscard, discardRef, onLineChange, onLineContextMenu, annotations, header, onRangeChange, conflictLabels, onPickRegion, result }: {
  patch: NonNullable<ChangesState["patch"]>; disabled: boolean;
  /** History: no staging or discard actions and no line selection. */
  readOnly?: boolean;
  /** Buttons at the end of the header (a stash's Apply, Pop and Drop…). */
  accessory?: ReactNode;
  onApply: (keys: ReadonlySet<string>, text: string) => void; applyRef?: { current: (() => void) | null };
  /** Unstaged side only: asks to discard the keys from the worktree. */
  onDiscard?: (keys: ReadonlySet<string>, text: string, what: string) => void; discardRef?: { current: (() => void) | null };
  /** The line clicked last (what Blame Line acts on), or null when the patch changes or the pane goes away. */
  onLineChange?: (target: DiffLineTarget | null) => void;
  /** Right-click or Control-click on a line, in window coordinates. */
  onLineContextMenu?: (target: DiffLineTarget, position: { x: number; y: number }) => void;
  /** Content under rows by anchor key (`R:12`, `L:7`; see reviewThreads.ts): the row gets a comment marker in its gutter. */
  annotations?: ReadonlyMap<string, ReactNode>;
  /** Content above the first hunk (threads not on the diff). */
  header?: ReactNode;
  /** readOnly: Shift-click extends the clicked line into a range; called with its first and last lines. */
  onRangeChange?: (range: { start: DiffLineTarget; end: DiffLineTarget } | null) => void;
  /** A conflicted file: what its sides are called ("“main”"), for its regions' sections and picks. */
  conflictLabels?: { ours: string; theirs: string };
  /** A conflicted file: resolves one region in the worktree file, given the text its regions were read from. */
  onPickRegion?: (index: number, side: ConflictRegionSide, shown: string) => void;
  /** A conflicted text file: its editable Result, kept in `store` and written by `onSave`. */
  result?: { store: ResultDraftStore; onSave: (draft: ResultDraft) => Promise<boolean> };
}) {
  const appearance = useColorScheme() === "dark" ? "dark" : "light";
  const [loaded, setLoaded] = useState<{ text: string; document: DiffDocument; rows: DiffRenderRow[] } | null>(null);
  // The window's documents, so a pane the layout moves reuses its document; a pane outside a window owns its own.
  const shared = useContext(DiffDocumentCacheContext);
  const [own] = useState(() => shared ? null : createDiffDocumentCache());
  const documents = shared ?? own!;
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ selected: ReadonlySet<string>; anchor: number | null }>({ selected: new Set(), anchor: null });
  const [cursor, setCursor] = useState<number | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const lineChange = useRef(onLineChange);
  lineChange.current = onLineChange;
  const rangeChange = useRef(onRangeChange);
  rangeChange.current = onRangeChange;
  const staged = patch.section === "staged";
  const verb = staged ? "Unstage" : "Stage";
  const discard = staged || readOnly ? undefined : onDiscard;
  const linesLabel = (count: number) => count === 1 ? "1 selected line" : `${count} selected lines`;

  useEffect(() => {
    let cancelled = false;
    setSelection({ selected: new Set(), anchor: null });
    setCursor(null);
    setRangeAnchor(null);
    lineChange.current?.(null);
    setError(null);
    if (!patch.file?.hunks.length) { setLoaded(null); return; }
    const { path, text } = patch;
    documents.acquire(path, text, 10_000).then(result => {
      if (!cancelled) setLoaded({ text, document: result.document, rows: result.document.getPlainRows(0, result.document.rowCount) });
    }, (reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { cancelled = true; documents.release(path, text); };
  }, [patch.text, patch.path, patch.section]); // eslint-disable-line react-hooks/exhaustive-deps -- patch.file is derived from patch.text
  useEffect(() => () => { lineChange.current?.(null); }, []);

  const items = useMemo(() => loaded?.text === patch.text ? diffPaneItems(loaded.rows) : [], [loaded, patch.text]);
  const range = useMemo(() => lineRange(items, rangeAnchor, cursor, patch), [items, rangeAnchor, cursor]); // eslint-disable-line react-hooks/exhaustive-deps -- patch follows items
  useEffect(() => { rangeChange.current?.(range); }, [range]);
  useEffect(() => () => rangeChange.current?.(null), []);
  const bounds = useMemo(() => rangeBounds(items, rangeAnchor, cursor), [items, rangeAnchor, cursor]);
  const inRange = (index: number) => !!bounds && index >= bounds.from && index <= bounds.to;
  const palette = getDiffRowPalette(appearance);
  // Per pane: two panes can share one cached document, but each needs its own native config entry.
  const paneId = useId();
  const configId = `git:${paneId}:${loaded?.document.documentId ?? 0}:unified`;
  const foregroundColor = appearance === "dark" ? "#e6edf3" : "#1f2328";
  const mutedColor = appearance === "dark" ? "#8b949e" : "#6e7781";
  const selected = selection.selected;
  const moveCursor = (index: number) => {
    const item = items[index];
    const target = item?.type === "line" ? lineTarget(item.row, patch) : null;
    setCursor(index);
    lineChange.current?.(target);
    return target;
  };
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
  const regions = patch.conflicted && onPickRegion ? patch.regions : null;
  const twoTextSides = !!patch.conflict && patch.conflict.ours && patch.conflict.theirs && !patch.conflict.binary;
  const message = patch.conflicted ? regions?.regions?.length ? null
    : regions?.regions && twoTextSides ? "No conflict markers are left. Review the file, then Mark Resolved."
    : "This file has merge conflicts. Use one side or both, or resolve them in the file, then Mark Resolved."
    : patch.file?.binary ? readOnly ? "Binary file." : `Binary file. ${verb}${discard ? " or discard" : ""} the whole file from the list.`
    : !patch.file ? "No changes to show."
    : !patch.file.hunks.length ? readOnly ? "No content changes (mode or rename only)." : `No content changes. ${verb} the whole file to include mode or rename changes.`
    : error;

  const markerColor = useSymbolColor("blue");
  /** The row, then whatever is annotated on either of its sides. */
  const withAnnotations = (row: DiffRenderRow, content: ReactElement) => {
    const nodes = annotations?.size ? rowAnchorKeys(row).flatMap(key => annotations.has(key) ? [<View key={key}>{annotations.get(key)}</View>] : []) : [];
    return nodes.length ? <>{content}{nodes}</> : content;
  };
  const annotated = (row: DiffRenderRow) => !!annotations?.size && rowAnchorKeys(row).some(key => annotations.has(key));
  const { name, folder } = pathParts(patch.path);
  const regionList = (regions: NonNullable<typeof patch.regions>) => regions.regions?.length ? <ScrollView key={patch.path} style={styles.fill} contentContainerStyle={styles.regions}>
    {regions.regions.map((region, index) => <ConflictRegionView key={`${index}:${region.start}`} region={region} index={index} count={regions.regions!.length}
      labels={conflictLabels ?? { ours: "Ours", theirs: "Theirs" }} disabled={disabled} appearance={appearance} onPick={side => onPickRegion!(index, side, regions.text)} />)}
  </ScrollView> : null;
  return <View style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.path} numberOfLines={1} accessibilityRole="header">{name}{folder ? <Text style={styles.folder}>{`  ${folder}`}</Text> : null}</Text>
      {/* A conflicted file has no lines to act on; its accessory holds the conflict picks. */}
      {discard && !patch.conflicted ? <Button style={styles.action} disabled={disabled || !selected.size || !!message} onPress={() => discard(selected, patch.text, linesLabel(selected.size))}>Discard Lines…</Button> : null}
      {readOnly || patch.conflicted ? null : <Button style={styles.action} disabled={disabled || !selected.size} onPress={() => onApply(selected, patch.text)}>{`${verb} Lines`}</Button>}
      {accessory}
    </View>
    {regions && result ? <View style={styles.fill}>
      {message ? <Text style={styles.message}>{message}</Text> : regionList(regions)}
      <ResultView path={patch.path} disk={regions.text} size={regions.size} store={result.store} disabled={disabled} appearance={appearance} onSave={result.onSave} />
    </View> : message ? <Text style={styles.message}>{message}</Text> : regions?.regions ? regionList(regions) : loaded && <>
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
        ListHeaderComponent={header ? <>{header}</> : null}
        renderItem={({ item, index }) => item.type === "hunk" ? <View style={styles.hunk}>
          <Text style={[styles.hunkTitle, { fontFamily }]} numberOfLines={1} accessibilityLabel={`Hunk ${item.hunkIndex + 1}`}>{hunkTitle(patch.file!.hunks[item.hunkIndex]!)}</Text>
          {discard ? <Button style={styles.action} disabled={disabled} onPress={() => discard(new Set(unifiedPatchHunkKeys(patch.file!.hunks[item.hunkIndex]!)), patch.text, `hunk ${item.hunkIndex + 1} of “${patch.path}”`)}>Discard Hunk…</Button> : null}
          {readOnly ? null : <Button style={styles.action} disabled={disabled} onPress={() => onApply(new Set(unifiedPatchHunkKeys(patch.file!.hunks[item.hunkIndex]!)), patch.text)}>{`${verb} Hunk`}</Button>}
        </View> : withAnnotations(item.row, <Pressable
          accessibilityRole="button" accessibilityLabel={`${item.row.changeType === 1 ? "Added" : item.row.changeType === 2 ? "Removed" : "Context"} line ${item.row.text}`}
          accessibilityState={{ selected: readOnly ? inRange(index) : !!item.key && selected.has(item.key) }}
          accessibilityActions={!readOnly && item.key ? [{ name: "activate" }] : undefined}
          onAccessibilityAction={() => { if (readOnly) setRangeAnchor(index); moveCursor(index); setSelection(state => nextLineSelection(items, state.selected, state.anchor, index, { meta: true })); }}
          onPress={event => {
            const native = event.nativeEvent as MouseDetails;
            if (native.ctrlKey) return;
            if (readOnly) setRangeAnchor(anchor => native.shiftKey && cursor !== null ? anchor ?? cursor : index);
            moveCursor(index);
            if (!readOnly) setSelection(state => nextLineSelection(items, state.selected, state.anchor, index, { shift: native.shiftKey, meta: native.metaKey }));
          }}
          // Pressability only presses for the primary button, so the context menu comes from the raw touch end.
          onTouchEnd={(event: GestureResponderEvent) => {
            const mouse = event.nativeEvent as MouseDetails;
            if (mouse.button !== 2 && !mouse.ctrlKey) return;
            const target = moveCursor(index);
            if (target) onLineContextMenu?.(target, { x: mouse.pageX ?? 0, y: mouse.pageY ?? 0 });
          }}>
          <DiffNativeRow adaptiveRender="normal" configId={configId} itemId={item.row.index} rowIndex={item.row.index} style={styles.row} />
          {/* The overlay takes the hit so the native row's text-selection tracking doesn't swallow the click. */}
          <View style={[styles.hitTarget, (readOnly ? inRange(index) : !!item.key && selected.has(item.key)) && styles.selected]} />
          {annotated(item.row) ? <SFSymbol name="text.bubble.fill" color={markerColor} size={11} style={styles.marker} accessibilityLabel="Has comments" /> : null}
        </Pressable>)}
      />
    </>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor") },
  header: { flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingLeft: 16, paddingRight: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("windowBackgroundColor") },
  path: { flex: 1, fontSize: 13, fontWeight: "600", color: PlatformColor("labelColor") },
  folder: { fontSize: 11, fontWeight: "400", color: PlatformColor("secondaryLabelColor") },
  action: { width: 104, height: 24 },
  message: { paddingHorizontal: 16, paddingVertical: 20, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
  config: { width: 0, height: 0, overflow: "hidden" },
  hunk: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 12, height: 32, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("controlBackgroundColor") },
  hunkTitle: { flex: 1, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  row: { width: "100%", height: rowHeight },
  hitTarget: { ...StyleSheet.absoluteFillObject },
  marker: { position: "absolute", left: 6, top: 4, width: 13, height: 12 },
  selected: { backgroundColor: PlatformColor("selectedContentBackgroundColor"), opacity: 0.28 },
  regions: { paddingBottom: 16 },
  fill: { flex: 1 },
  result: { flex: 1.2, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  resultAction: { width: 76, height: 24 },
  region: { marginBottom: 12 },
  regionLabel: { paddingLeft: 16, paddingTop: 6, paddingBottom: 3, fontSize: 11, fontWeight: "600", color: PlatformColor("secondaryLabelColor") },
  regionLines: { borderLeftWidth: 3, paddingVertical: 2 },
  regionBase: { borderLeftColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("controlBackgroundColor") },
  regionLine: { flexDirection: "row", height: rowHeight, alignItems: "center" },
  regionNumber: { width: 44, paddingRight: 10, textAlign: "right", fontSize: 11, color: PlatformColor("tertiaryLabelColor") },
  regionText: { flex: 1, fontSize: 12, color: PlatformColor("labelColor") },
  regionEmpty: { paddingLeft: 54, height: rowHeight, lineHeight: rowHeight, fontSize: 11, fontStyle: "italic", color: PlatformColor("tertiaryLabelColor") },
});
