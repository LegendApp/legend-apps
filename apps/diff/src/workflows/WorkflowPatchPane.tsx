import { DiffHorizontalScroller, loadUnifiedDiff, type DiffDocument, type DiffSideBySideProjection } from "@legend-apps/diff-parser";
import { LegendList } from "@legendapp/list/react-native";
import { useObservable, useValue } from "@legendapp/state/react";
import type { Observable } from "@legendapp/state";
import { runCommand } from "@legendapp/spark/processes";
import { useEffect, useMemo, useState } from "react";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { Text, View } from "react-native";
import type { DiffOpenSource } from "../diffFiles";
import type { DiffViewMode } from "../diffSettings";
import { StoryDescription } from "../story/StoryDescription";
import { DiffSideBySideRow, DiffUnifiedRow, diffHunkHeaderHeight, type DiffRowRenderState } from "../viewer/DiffRows";
import type { DiffSplitPaneMetrics } from "../viewer/diffViewerModel";
import { DiffNativeRowConfigView } from "../window/DiffViewerPane";
import type { DiffNativeRowConfigProps } from "../window/diffWindowTypes";
import { requestDiffTokenizedFiles } from "../viewer/diffLoadedDocumentModel";
import { diffFileHeaderRowHeight } from "../viewer/diffViewerConstants";
import { createVisibleDiffRowIndexes } from "../viewer/diffLoadedDocumentIndexes";
import type { WorkflowPatch } from "./workflowContract";
import { applyWorkflowPatch, reloadWorkflowPatchInput, workflowPatchApplyDisabled } from "./workflowPatch";
import { DiffButton } from "../window/DiffControls";
import { diffSystemColor } from "../window/diffSystemColors";

export type WorkflowProposal = { output: WorkflowPatch; source: DiffOpenSource; repoRoot?: string; settings: { ignoreWhitespaceChanges: boolean; showOnlyHunks: boolean } };
export type WorkflowPatchViewerProps = {
  viewMode: DiffViewMode; rowHeight: number; rowRender$: Observable<DiffRowRenderState>;
  unifiedConfig: DiffNativeRowConfigProps; blocksConfig: DiffNativeRowConfigProps;
  splitPaneMetrics$: Observable<DiffSplitPaneMetrics>; foregroundColor: string; mutedColor: string;
};
type Snapshot = { document: DiffDocument; projection: DiffSideBySideProjection };
export function WorkflowPatchPane({ proposal, currentHash, onClose, onDiscard, onApplied, viewMode, rowHeight, rowRender$, unifiedConfig, blocksConfig, splitPaneMetrics$, foregroundColor: color, mutedColor }: WorkflowPatchViewerProps & {
  proposal: WorkflowProposal; currentHash?: string; onClose: () => void; onDiscard: () => void; onApplied: () => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const collapsed$ = useObservable(new Set<number>());
  const collapsed = useValue(collapsed$);
  const showOnlyHunks = useValue(rowRender$.presentation.showOnlyHunks);
  const tokenization$ = useObservable({ ranges: "", version: 0 });
  const applyController = useMemo(() => new AbortController(), [proposal]);
  useEffect(() => () => applyController.abort(), [applyController]);
  useEffect(() => {
    setSnapshot(null); setError(null); collapsed$.set(new Set<number>());
    let cancelled = false;
    let owned: Snapshot | undefined;
    void loadUnifiedDiff(proposal.output.patch, "Proposed changes", 0).then(loaded => {
      if (cancelled) { loaded.document.releaseNativeResources(); return; }
      try {
        owned = { document: loaded.document, projection: loaded.document.createSideBySideProjection([]) };
        setSnapshot(owned);
      } catch (reason) { loaded.document.releaseNativeResources(); setError(String(reason)); }
    }).catch((reason: unknown) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; owned?.projection.releaseNativeResources(); owned?.document.releaseNativeResources(); };
  }, [proposal, collapsed$]);
  const baseConfig = viewMode === "unified" ? unifiedConfig : blocksConfig;
  const config = useMemo(() => snapshot ? { ...baseConfig,
    configId: `workflow-patch:${snapshot.document.documentId}:${viewMode}`, documentId: snapshot.document.documentId,
    projectionId: viewMode === "unified" ? 0 : snapshot.projection.projectionId,
  } : null, [snapshot, baseConfig, viewMode]);
  const extraData = useMemo(() => ({ config, showOnlyHunks }), [config, showOnlyHunks]);
  const patchRows$ = useObservable<DiffRowRenderState>({
    document: { collapsedFileIndexList: [], current: null, fileByIndex: new Map(), fileByRowStart: new Map(), fileHeaderRowIndexes: new Set(), sideBySideFileHeaderByListIndex: new Map(), sideBySideRowCount: 0 },
    presentation: rowRender$.presentation.peek(),
  });
  useEffect(() => {
    const update = () => patchRows$.presentation.set(rowRender$.presentation.peek());
    update();
    return rowRender$.presentation.onChange(update);
  }, [patchRows$, rowRender$]);
  useEffect(() => {
    if (!snapshot) return;
    const files = snapshot.document.getFiles();
    patchRows$.document.set({ collapsedFileIndexList: [...collapsed], current: snapshot.document, fileByIndex: new Map(files.map(file => [file.index, file])),
      fileByRowStart: new Map(files.map(file => [file.rowStart, file])), fileHeaderRowIndexes: new Set(files.map(file => file.rowStart)),
      sideBySideFileHeaderByListIndex: new Map(), sideBySideRowCount: snapshot.projection.rowCount });
  }, [snapshot, patchRows$, collapsed]);
  useEffect(() => {
    if (!snapshot || !config?.syntaxHighlightingEnabled) return;
    const timer = setInterval(() => {
      const ranges = snapshot.document.consumeTokenizedRowRanges();
      if (ranges.length) tokenization$.set({ ranges: ranges.map(range => `${range.start}:${range.end}`).join(","), version: snapshot.document.getTokenizedRowVersion() });
    }, 100);
    return () => clearInterval(timer);
  }, [snapshot, config?.syntaxHighlightingEnabled, tokenization$]);
  const rows = useMemo(() => {
    if (!snapshot) return [];
    const files = snapshot.document.getFiles();
    const hunkRows = new Set(snapshot.document.getHunkRowIndexes());
    const headerRows = new Set(files.map(file => file.rowStart));
    const indexes = viewMode === "unified" ? createVisibleDiffRowIndexes(files, collapsed, []) : Array.from({ length: snapshot.projection.rowCount }, (_, index) => index);
    return indexes.map(index => {
      const item = viewMode === "unified" ? undefined : snapshot.projection.getItem(snapshot.projection.getItemId(index));
      return { index, item, header: item ? item.kind === "file-header" : headerRows.has(index), hunk: item ? item.hunkStart : hunkRows.has(index) };
    });
  }, [snapshot, viewMode, collapsed]);
  const toggleFileCollapsed = (fileIndex: number) => {
    const next = new Set(collapsed$.peek());
    if (next.has(fileIndex)) next.delete(fileIndex); else next.add(fileIndex);
    snapshot?.projection.setFileCollapsed(fileIndex, next.has(fileIndex));
    collapsed$.set(next);
  };
  const disabledReason = workflowPatchApplyDisabled(proposal.output, proposal.source, proposal.repoRoot, currentHash, applying);
  const apply = async () => {
    if (disabledReason || !snapshot) return;
    setApplying(true); setError(null);
    try {
      await applyWorkflowPatch(proposal.output, { source: proposal.source, repoRoot: proposal.repoRoot, signal: applyController.signal,
        reloadInput: signal => reloadWorkflowPatchInput(proposal.source, proposal.settings, signal) });
      if (!applyController.signal.aborted) onApplied();
    } catch (reason) { if (!applyController.signal.aborted) setError(`Apply failed: ${reason instanceof Error ? reason.message : String(reason)}`); }
    finally { if (!applyController.signal.aborted) setApplying(false); }
  };
  return <View className="flex-1" style={{ paddingTop: 52 }}>
    <View className="gap-2 px-5 py-3"><Text accessibilityRole="header" style={{ color, fontSize: 20, fontWeight: "600" }}>Proposed changes</Text>
      <Text selectable style={{ color: mutedColor, fontSize: 11 }}>{proposal.source.label} · {proposal.output.baseDiffHash}</Text>
      <StoryDescription markdown={proposal.output.description} color={color} />
      <View className="flex-row flex-wrap gap-2"><DiffButton title={applying ? "Applying…" : "Apply"} disabled={!!disabledReason || !snapshot} onPress={() => { void apply(); }} />
        <DiffButton title="Copy patch" onPress={() => { void runCommand({ target: { type: "command", name: "pbcopy" }, input: proposal.output.patch }).then(result => setCopyStatus(result.exit.type === "exited" && result.exit.code === 0 ? "Copied patch" : "Unable to copy patch")).catch((reason: unknown) => setCopyStatus(String(reason))); }} />
        <DiffButton title="Discard" disabled={applying} onPress={onDiscard} /><DiffButton title="Back to workflows" disabled={applying} onPress={onClose} />
      </View>
      {disabledReason ? <View className="flex-row items-center gap-2"><SFSymbol color={diffSystemColor("systemOrangeColor")} name="exclamationmark.triangle.fill" size={12} /><Text className="flex-1" style={{ color: mutedColor }}>{disabledReason}</Text></View> : <Text style={{ color: mutedColor }}>Apply checks the original source again and changes working files only.</Text>}
      {error ? <Text selectable accessibilityRole="alert" style={{ color: diffSystemColor("systemRedColor") }}>{error}</Text> : null}{copyStatus ? <Text style={{ color: mutedColor }}>{copyStatus}</Text> : null}
      {!snapshot && !error ? <Text style={{ color: mutedColor }}>Loading proposed diff…</Text> : null}
      {!proposal.output.patch.trim() ? <Text style={{ color: mutedColor }}>No proposed changes.</Text> : null}
    </View>
    {config && snapshot ? <>
      <DiffNativeRowConfigView searchEnabled={false} nativeRowConfig={config} splitPaneMetrics$={splitPaneMetrics$} syntaxTokenizationState$={tokenization$} />
      <LegendList data={rows} extraData={extraData} recycleItems keyExtractor={row => String(row.index)} estimatedItemSize={rowHeight}
        getFixedItemSize={row => row.header ? diffFileHeaderRowHeight : rowHeight + (showOnlyHunks && row.hunk ? diffHunkHeaderHeight : 0)} style={{ flex: 1 }}
        onViewableItemsChanged={({ viewableItems }) => { if (config.syntaxHighlightingEnabled) {
          const indexes = new Set(viewableItems.map(({ item }) => item.item?.fileIndex ?? snapshot.document.getPlainRows(item.index, 1)[0]?.fileIndex));
          requestDiffTokenizedFiles(snapshot.document, snapshot.document.getFiles().filter(file => indexes.has(file.index)), "scroll");
        } }}
        renderItem={({ item }) => item.item ? <DiffSideBySideRow adaptiveRender="normal" collapsedFileIndexes$={collapsed$} index={item.item.itemId} listIndex={item.index} itemMetadata={item.item} nativeConfigId={config.configId} nativeRowHeight={rowHeight} onToggleFileCollapsed={toggleFileCollapsed} rowRender$={patchRows$} row={undefined} />
          : <DiffUnifiedRow adaptiveRender="normal" collapsedFileIndexes$={collapsed$} hasHunkHeader={showOnlyHunks && item.hunk} index={item.index} isFileHeader={item.header} nativeConfigId={config.configId} nativeRowHeight={rowHeight} onToggleFileCollapsed={toggleFileCollapsed} rowRender$={patchRows$} row={undefined} />} />
      <DiffHorizontalScroller collapsable={false} configId={config.configId} style={{ height: 12 }} />
    </> : null}
  </View>;
}
