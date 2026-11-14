import { DiffHorizontalScroller, loadUnifiedDiff, type DiffDocument, type DiffSideBySideProjection } from "@legend-apps/diff-parser";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useObservable, useValue } from "@legendapp/state/react";
import type { Observable } from "@legendapp/state";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { runCommand } from "@legendapp/spark/processes";
import type { DiffViewMode } from "../diffSettings";
import { DiffUnifiedRow, DiffSideBySideRow, type DiffRowRenderState } from "../viewer/DiffRows";
import { requestDiffTokenizedFiles } from "../viewer/diffLoadedDocumentModel";
import type { DiffSplitPaneMetrics } from "../viewer/diffViewerModel";
import { DiffNativeRowConfigView } from "../window/DiffViewerPane";
import type { DiffNativeRowConfigProps } from "../window/diffWindowTypes";
import { buildStoryInput, type StoryHunk, type StoryInput } from "./storyHunks";
import { storyToMarkdown } from "./storyMarkdown";
import { buildStoryRows, nextStorySection, type StoryRow } from "./storyRows";
import { getStoryReviewStore } from "./storyReview";
import { StoryDescription } from "./StoryDescription";
import { useStoryAppearance } from "./storyAppearance";
import { storyPrivacyNotice } from "./storyStore";
import type { useDiffStory } from "./useDiffStory";

export type StoryPaneRef = { navigate: (direction: -1 | 1) => boolean; scrollToSection: (index: number) => void };
type PaneRow = StoryRow | { type: "header"; key: string };
type Snapshot = { document: DiffDocument; input: StoryInput; projection: DiffSideBySideProjection };
const headerRow: PaneRow = { type: "header", key: "header" };
function noop() {}
function keyExtractor(row: PaneRow) { return row.key; }
function getItemType(row: PaneRow) { return row.type; }

function Action({ title, onPress, disabled = false, color }: { title: string; onPress: () => void; disabled?: boolean; color: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} className="rounded border px-3 py-1" style={{ borderColor: color, opacity: disabled ? 0.4 : 1 }}><Text style={{ color, fontSize: 12 }}>{title}</Text></Pressable>;
}

export const StoryPane = forwardRef<StoryPaneRef, {
  controller: ReturnType<typeof useDiffStory>; viewMode: DiffViewMode; rowHeight: number;
  rowRender$: Observable<DiffRowRenderState>; collapsedFileIndexes$: Observable<Set<number>>;
  unifiedConfig: DiffNativeRowConfigProps; blocksConfig: DiffNativeRowConfigProps;
  splitPaneMetrics$: Observable<DiffSplitPaneMetrics>; foregroundColor: string; mutedColor: string; backgroundColor: string;
  onJumpToHunk: (hunk: StoryHunk, stale: boolean) => void;
}>(function StoryPane({ controller, viewMode, rowHeight, rowRender$, collapsedFileIndexes$, unifiedConfig, blocksConfig, splitPaneMetrics$, foregroundColor, mutedColor, backgroundColor, onJumpToHunk }, ref) {
  const { notice, preparing, error } = controller;
  const story = useValue(controller.story$);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [showRaw, setShowRaw] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const listRef = useRef<LegendListRef | null>(null);
  const currentSection = useRef(-1);
  const appearance = useStoryAppearance();
  const accent = appearance.accentColor ?? foregroundColor;
  const syntaxTokenizationState$ = useObservable({ ranges: "", version: 0 });
  const input = story.input;
  const result = story.result;
  useEffect(() => {
    setSnapshot(null); setSnapshotError(null); setExpanded(new Set()); currentSection.current = -1;
    if (!input) return;
    let cancelled = false;
    let owned: Snapshot | undefined;
    void loadUnifiedDiff(input.diffText, "Change Story", 0).then(loaded => {
      if (cancelled) { loaded.document.releaseNativeResources(); return; }
      try {
        const nativeInput = buildStoryInput(loaded.document, { kind: "diffFile", value: "story", label: "Change Story" });
        if (nativeInput.hunks.length !== input.hunks.length || nativeInput.hunks.some((hunk, i) => hunk.file !== input.hunks[i].file)) throw new Error("The cached hunk snapshot could not be reconstructed. Regenerate the story.");
        owned = { document: loaded.document, input: { ...nativeInput, diffHash: input.diffHash }, projection: loaded.document.createSideBySideProjection([]) };
        setSnapshot(owned);
      } catch (reason) { loaded.document.releaseNativeResources(); setSnapshotError(String(reason)); }
    }).catch((reason: unknown) => { if (!cancelled) setSnapshotError(String(reason)); });
    return () => { cancelled = true; owned?.projection.releaseNativeResources(); owned?.document.releaseNativeResources(); };
  }, [input]);
  const model = useMemo(() => result && snapshot ? buildStoryRows(result.story, snapshot.input, {
    expanded, projection: viewMode === "unified" ? undefined : snapshot.projection,
  }) : null, [result, snapshot, expanded, viewMode]);
  const rows = useMemo<PaneRow[]>(() => [headerRow, ...(model?.rows ?? [])], [model]);
  const reviewStore = getStoryReviewStore();
  const reviewKey = result ? `${result.diffHash}-${result.createdAt}` : "";
  useEffect(() => { if (result) reviewStore.load(reviewKey); }, [reviewStore, result, reviewKey]);
  const reviewed = useValue(() => result ? reviewStore.reviewed$[reviewKey].get() ?? [] : []);
  const reviewedCount = result?.story.sections.filter(section => reviewed.includes(section.id)).length ?? 0;
  const running = story.status === "running" || story.status === "progress";
  const stale = !!result && (story.status === "stale" || result.diffHash !== controller.request?.input.diffHash);
  const baseConfig = viewMode === "unified" ? unifiedConfig : blocksConfig;
  const config = useMemo(() => snapshot ? { ...baseConfig,
    configId: `story:${snapshot.document.documentId}:${viewMode}`, documentId: snapshot.document.documentId,
    projectionId: viewMode === "unified" ? 0 : snapshot.projection.projectionId,
  } : null, [baseConfig, snapshot, viewMode]);
  useEffect(() => {
    if (!snapshot || !config?.syntaxHighlightingEnabled) return;
    const timer = setInterval(() => {
      const ranges = snapshot.document.consumeTokenizedRowRanges();
      if (ranges.length) syntaxTokenizationState$.set({ ranges: ranges.map(range => `${range.start}:${range.end}`).join(","), version: snapshot.document.getTokenizedRowVersion() });
    }, 100);
    return () => clearInterval(timer);
  }, [snapshot, config?.syntaxHighlightingEnabled, syntaxTokenizationState$]);
  const navigate = useCallback((direction: -1 | 1) => {
    if (!model) return false;
    const next = nextStorySection(model.sections, currentSection.current, direction);
    if (next < 0) return false;
    currentSection.current = next;
    void listRef.current?.scrollToIndex({ index: model.sections[next] + 1, animated: true, viewOffset: 52 });
    return true;
  }, [model]);
  useImperativeHandle(ref, () => ({ navigate, scrollToSection(index) {
    if (model && index >= 0 && index < model.sections.length) { currentSection.current = index; void listRef.current?.scrollToIndex({ index: model.sections[index] + 1, animated: true, viewOffset: 52 }); }
  } }), [navigate, model]);
  const copy = useCallback(() => {
    if (!result || !input) return;
    void runCommand({ target: { type: "command", name: "pbcopy" }, input: storyToMarkdown(result.story, input) }).then(response => {
      setCopyStatus(response.exit.type === "exited" && response.exit.code === 0 ? "Copied" : "Unable to copy");
    }).catch((reason: unknown) => setCopyStatus(String(reason)));
  }, [result, input]);
  const renderItem = useCallback(({ item }: { item: PaneRow }) => {
    if (item.type === "line" && config) {
      return item.item
        ? <DiffSideBySideRow adaptiveRender="normal" collapsedFileIndexes$={collapsedFileIndexes$} index={item.sourceIndex} listIndex={item.listIndex} itemMetadata={item.item} nativeConfigId={config.configId} nativeRowHeight={rowHeight} onToggleFileCollapsed={noop} rowRender$={rowRender$} row={undefined} />
        : <DiffUnifiedRow adaptiveRender="normal" collapsedFileIndexes$={collapsedFileIndexes$} hasHunkHeader={false} index={item.sourceIndex} isFileHeader={false} nativeConfigId={config.configId} nativeRowHeight={rowHeight} onToggleFileCollapsed={noop} rowRender$={rowRender$} row={undefined} />;
    }
    let content;
    if (item.type === "header") content = <>
      <Text accessibilityRole="header" style={{ color: foregroundColor, fontSize: appearance.titleSize ?? 24, fontWeight: "600" }}>{result?.story.title ?? "Change Story"}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Action color={accent} title={result ? "Regenerate" : "Generate story"} disabled={running || preparing || !controller.request} onPress={() => controller.generate(true)} />
        {result ? <Action color={accent} title="Copy as Markdown" onPress={copy} /> : null}
        {running ? <Action color={accent} title="Cancel" onPress={controller.cancel} /> : null}
      </View>
      <Text style={{ color: mutedColor }}>{result ? `${result.story.state} · ${result.story.risk.level} risk — ${result.story.risk.reason}` : "Generate a guided review with your signed-in AI CLI. Stories are never generated automatically."}</Text>
      {result ? <><Text style={{ color: foregroundColor }}>{result.story.goal}</Text><Text style={{ color: mutedColor }}>{result.skillName} · {result.tool} / {result.model}</Text><Text selectable style={{ color: mutedColor, fontSize: 11 }}>{result.diffHash}{stale ? " · Stale — regenerate for the current diff" : ""}</Text><Text style={{ color: mutedColor }}>{model?.coverage.covered ?? result.coveredHunkIds.length}/{model?.coverage.total ?? input?.hunks.length} hunks covered · {reviewedCount}/{result.story.sections.length} sections reviewed</Text><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: result.story.sections.length, now: reviewedCount }} className="h-1 overflow-hidden rounded" style={{ backgroundColor: mutedColor }}><View className="h-1" style={{ backgroundColor: accent, width: `${result.story.sections.length ? reviewedCount / result.story.sections.length * 100 : 0}%` }} /></View></> : null}
      {running ? <Text accessibilityLiveRegion="polite" style={{ color: foregroundColor }}>{story.progress?.phase ?? "starting"} · {story.progress?.receivedBytes ?? 0} bytes received</Text> : null}
      {preparing ? <Text style={{ color: mutedColor }}>Preparing story…</Text> : null}
      {result && !snapshot && !snapshotError ? <Text style={{ color: mutedColor }}>Loading native hunks…</Text> : null}
      {error || story.error || snapshotError ? <Text selectable style={{ color: foregroundColor }}>{error ?? story.error?.message ?? snapshotError}</Text> : null}
      {story.error?.rawOutput !== undefined ? <><Action color={accent} title={showRaw ? "Hide raw output" : "Show raw output"} onPress={() => setShowRaw(value => !value)} />{showRaw ? <Text selectable style={{ color: mutedColor, fontFamily: "Menlo" }}>{story.error.rawOutput}</Text> : null}</> : null}
      {result?.issues.map((issue, index) => <Text key={index} style={{ color: mutedColor }}>Reference dropped: {issue.path}: {issue.message}</Text>)}
      <Text style={{ color: mutedColor }}>Generation settings for this {controller.request?.repoRoot ? "repository" : "source"}</Text>
      <View className="flex-row flex-wrap gap-2">{(["codex", "claude"] as const).map(tool => <Action key={tool} color={accent} title={`${controller.tool === tool ? "✓ " : ""}${tool === "codex" ? "Codex" : "Claude"}`} disabled={running} onPress={() => { controller.setTool(tool); setPrivacyStatus(null); }} />)}<Action color={accent} title="Disable generation" disabled={running || !controller.request} onPress={() => { controller.disable(); setPrivacyStatus("Generation disabled for this source. Cached stories remain available."); }} /></View>
      {notice ? <View className="gap-2 rounded border p-3" style={{ borderColor: accent }}><Text style={{ color: foregroundColor }}>{storyPrivacyNotice(notice.tool)}</Text><View className="flex-row gap-2"><Action color={accent} title="Enable and generate" onPress={() => controller.consent(true)} /><Action color={accent} title="Keep disabled" onPress={() => { controller.consent(false); setPrivacyStatus("Generation remains disabled."); }} /></View></View> : null}
      {privacyStatus ? <Text style={{ color: mutedColor }}>{privacyStatus}</Text> : null}{copyStatus ? <Text style={{ color: mutedColor }}>{copyStatus}</Text> : null}
    </>;
    else if (item.type === "section" && result) content = <>
      <Text accessibilityRole="header" style={{ color: foregroundColor, fontSize: 18, fontWeight: "600" }}>{item.section.lookHere ? "● Look here · " : ""}{item.section.title}</Text>
      {item.section.commit ? <Text style={{ color: mutedColor }}>{item.section.commit}</Text> : null}
      <StoryDescription markdown={item.section.description} color={foregroundColor} />
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Mark reviewed: ${item.section.title}`} accessibilityState={{ checked: reviewed.includes(item.section.id) }} onPress={() => reviewStore.setReviewed(reviewKey, item.section.id, !reviewed.includes(item.section.id))}><Text style={{ color: accent }}>{reviewed.includes(item.section.id) ? "☑ Reviewed" : "☐ Mark reviewed"}</Text></Pressable>
    </>;
    else if (item.type === "hunk") content = <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.hunk.file} hunk in Files`} onPress={() => onJumpToHunk(item.hunk, stale)}><Text style={{ color: accent, fontFamily: "Menlo", fontSize: 12 }}>{item.hunk.file} · {item.partial ? `${item.ref.side} ${item.ref.startLine}–${item.ref.endLine}` : `−${item.hunk.oldStart},${item.hunk.oldLines} +${item.hunk.newStart},${item.hunk.newLines}`} ↗</Text></Pressable>
      {item.partial ? <Action color={mutedColor} title={item.expanded ? "Collapse context" : "Show hunk context"} onPress={() => setExpanded(current => { const next = new Set(current); if (next.has(item.contextKey)) next.delete(item.contextKey); else next.add(item.contextKey); return next; })} /> : null}
    </>;
    else if (item.type === "list") content = <><Text accessibilityRole="header" style={{ color: foregroundColor, fontWeight: "600" }}>{item.title}</Text>{item.items.map((text, index) => <Text selectable key={index} style={{ color: foregroundColor, fontSize: 13, lineHeight: 19 }}>• {text}</Text>)}</>;
    else if (item.type === "uncovered") content = <><Text accessibilityRole="header" style={{ color: foregroundColor, fontSize: 18, fontWeight: "600" }}>Not covered by the story</Text>{item.full ? <Text style={{ color: mutedColor }}>Full coverage</Text> : null}</>;
    else if (item.type === "file") content = <><Text style={{ color: foregroundColor, fontWeight: "600" }}>{item.path}</Text>{item.note ? <Text style={{ color: mutedColor }}>{item.note}</Text> : null}</>;
    return <View className="gap-2 px-5 py-3">{content}</View>;
  }, [accent, appearance.titleSize, collapsedFileIndexes$, config, controller, copy, copyStatus, error, foregroundColor, input, model, mutedColor, notice, onJumpToHunk, preparing, privacyStatus, result, reviewKey, reviewStore, reviewed, reviewedCount, rowHeight, rowRender$, running, showRaw, snapshot, snapshotError, stale, story]);
  return <View className="flex-1" style={{ backgroundColor }}>
    {config ? <DiffNativeRowConfigView searchEnabled={false} nativeRowConfig={config} splitPaneMetrics$={splitPaneMetrics$} syntaxTokenizationState$={syntaxTokenizationState$} /> : null}
    <LegendList ref={listRef} data={rows} extraData={renderItem} renderItem={renderItem} keyExtractor={keyExtractor} getItemType={getItemType} getFixedItemSize={item => item.type === "line" ? rowHeight : undefined} estimatedItemSize={rowHeight} recycleItems contentContainerStyle={{ paddingTop: 52, paddingBottom: 20 }} style={{ flex: 1 }} onViewableItemsChanged={({ viewableItems }) => {
      if (!model || !snapshot) return;
      const firstIndex = viewableItems[0]?.index ?? 0;
      currentSection.current = -1;
      model.sections.forEach((index, section) => { if (index + 1 <= firstIndex) currentSection.current = section; });
      if (config?.syntaxHighlightingEnabled) {
        const files = new Set(viewableItems.flatMap(({ item }) => item.type === "line" ? [item.item?.fileIndex ?? snapshot.input.hunks.find(hunk => item.sourceIndex >= hunk.rowStart && item.sourceIndex < hunk.rowStart + hunk.rowCount)?.fileIndex] : []));
        const visibleFiles = snapshot.input.files.filter(file => files.has(file.file.index)).map(file => file.file);
        if (visibleFiles.length) requestDiffTokenizedFiles(snapshot.document, visibleFiles, "scroll");
      }
    }} />
    {config ? <DiffHorizontalScroller collapsable={false} configId={config.configId} style={{ height: 12 }} /> : null}
  </View>;
});
