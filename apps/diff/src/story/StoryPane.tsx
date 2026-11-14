import { DiffHorizontalScroller, loadUnifiedDiff, type DiffDocument, type DiffSideBySideProjection } from "@legend-apps/diff-parser";
import { LegendList, type LegendListRef } from "@legendapp/list/react-native";
import { useObservable, useValue } from "@legendapp/state/react";
import type { Observable } from "@legendapp/state";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { SegmentedControl, Select } from "@legendapp/spark/ui";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { runCommand } from "@legendapp/spark/processes";
import type { DiffViewMode } from "../diffSettings";
import { DiffUnifiedRow, DiffSideBySideRow, type DiffRowRenderState } from "../viewer/DiffRows";
import { requestDiffTokenizedFiles } from "../viewer/diffLoadedDocumentModel";
import type { DiffSplitPaneMetrics } from "../viewer/diffViewerModel";
import { DiffNativeRowConfigView } from "../window/DiffViewerPane";
import type { DiffNativeRowConfigProps } from "../window/diffWindowTypes";
import { DiffButton, DiffCheckbox, DiffNotice } from "../window/DiffControls";
import { diffSymbolColors, diffSystemColor } from "../window/diffSystemColors";
import { buildStoryInput, type StoryHunk, type StoryInput } from "./storyHunks";
import { storyToMarkdown } from "./storyMarkdown";
import { buildStoryRows, nextStorySection, type StoryRow } from "./storyRows";
import { getStoryReviewStore } from "./storyReview";
import { StoryDescription } from "./StoryDescription";
import { useStoryAppearance } from "./storyAppearance";
import { repoSkillNotice } from "./skillTrust";
import { storyPrivacyNotice } from "./storyStore";
import type { useDiffStory } from "./useDiffStory";

export type StoryPaneRef = { navigate: (direction: -1 | 1) => boolean; scrollToSection: (index: number) => void };
type PaneRow = StoryRow | { type: "header"; key: string };
type Snapshot = { document: DiffDocument; input: StoryInput; projection: DiffSideBySideProjection };
const headerRow: PaneRow = { type: "header", key: "header" };
const toolOptions = [{ label: "Codex", value: "codex" }, { label: "Claude", value: "claude" }];
function noop() {}
function keyExtractor(row: PaneRow) { return row.key; }
function getItemType(row: PaneRow) { return row.type; }


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
        {controller.skill && controller.skills.some(skill => skill.name === controller.skill?.name) ? <Select accessibilityLabel="Story skill" options={controller.skills.map(skill => ({ label: `${skill.name} · ${skill.layer}`, value: skill.name }))} value={controller.skill.name} disabled={running} onValueChange={controller.selectSkill} style={{ width: Math.max(...controller.skills.map(skill => `${skill.name} · ${skill.layer}`.length)) * 7 + 48, height: 24 }} /> : null}
        <DiffButton title="Edit skill…" onPress={controller.editSkill} />
      </View>
      {controller.preview ? <View className="flex-row items-center gap-2"><Text style={{ color: accent }}>Preview — saved story unchanged</Text><DiffButton title="Close preview" onPress={controller.dismissPreview} /></View> : null}
      <View className="flex-row flex-wrap gap-2">
        <DiffButton title={controller.preview ? "Generate saved story" : result ? "Regenerate" : "Generate story"} disabled={running || preparing || !controller.request} onPress={() => controller.generate(true)} />
        {result ? <DiffButton title="Copy as Markdown" onPress={copy} /> : null}
        {running ? <DiffButton title="Cancel" onPress={controller.cancel} /> : null}
      </View>
      <Text style={{ color: mutedColor }}>{result ? `${result.story.state} · ${result.story.risk.level} risk — ${result.story.risk.reason}` : "Generate a guided review with your signed-in AI CLI. Stories are never generated automatically."}</Text>
      {result ? <><Text style={{ color: foregroundColor }}>{result.story.goal}</Text><Text style={{ color: mutedColor }}>{result.skillName} · {result.tool} / {result.model}</Text><Text selectable style={{ color: mutedColor, fontSize: 11 }}>{result.diffHash}{stale ? " · Stale — regenerate for the current diff" : ""}</Text><Text style={{ color: mutedColor }}>{model?.coverage.covered ?? result.coveredHunkIds.length}/{model?.coverage.total ?? input?.hunks.length} hunks covered · {reviewedCount}/{result.story.sections.length} sections reviewed</Text><View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: result.story.sections.length, now: reviewedCount }} className="h-1 overflow-hidden rounded" style={{ backgroundColor: mutedColor }}><View className="h-1" style={{ backgroundColor: accent, width: `${result.story.sections.length ? reviewedCount / result.story.sections.length * 100 : 0}%` }} /></View></> : null}
      {running ? <Text accessibilityLiveRegion="polite" style={{ color: foregroundColor }}>{story.progress?.phase ?? "starting"} · {story.progress?.receivedBytes ?? 0} bytes received</Text> : null}
      {preparing ? <Text style={{ color: mutedColor }}>Preparing story…</Text> : null}
      {result && !snapshot && !snapshotError ? <Text style={{ color: mutedColor }}>Loading native hunks…</Text> : null}
      {error || story.error || snapshotError ? <Text selectable style={{ color: foregroundColor }}>{error ?? story.error?.message ?? snapshotError}</Text> : null}
      {story.error?.rawOutput !== undefined ? <><DiffButton title={showRaw ? "Hide raw output" : "Show raw output"} onPress={() => setShowRaw(value => !value)} />{showRaw ? <Text selectable style={{ color: mutedColor, fontFamily: "Menlo" }}>{story.error.rawOutput}</Text> : null}</> : null}
      {result?.issues.map((issue, index) => <Text key={index} style={{ color: mutedColor }}>Reference dropped: {issue.path}: {issue.message}</Text>)}
      <Text style={{ color: mutedColor }}>Generation settings for this {controller.request?.repoRoot ? "repository" : "source"}</Text>
      <View className="flex-row flex-wrap items-center gap-2">{controller.tool ? <SegmentedControl accessibilityLabel="AI tool" options={toolOptions} value={controller.tool} disabled={running || (controller.skill?.tool ?? "auto") !== "auto"} onValueChange={tool => { controller.setTool(tool as "codex" | "claude"); setPrivacyStatus(null); }} style={{ width: 160, height: 24 }} /> : null}<DiffButton title="Disable generation" disabled={running || !controller.request} onPress={() => { controller.disable(); setPrivacyStatus("Generation disabled for this source. Cached stories remain available."); }} /></View>
      {controller.skillErrors.map((message, index) => <Text key={index} selectable style={{ color: foregroundColor }}>{message}</Text>)}
      {controller.trustNotice?.skill ? <DiffNotice symbol="exclamationmark.triangle.fill" symbolColor={diffSymbolColors.orange}><Text style={{ color: foregroundColor }}>{repoSkillNotice(controller.trustNotice.skill)}</Text><Text selectable style={{ color: mutedColor, fontFamily: "Menlo" }}>{controller.trustNotice.skill.markdown}</Text><View className="flex-row gap-2"><DiffButton title="Approve this skill" onPress={() => controller.approve(true)} /><DiffButton title="Don't run" onPress={() => controller.approve(false)} /></View></DiffNotice> : null}
      {notice ? <DiffNotice symbol="hand.raised.fill" symbolColor={diffSymbolColors.blue}><Text style={{ color: foregroundColor }}>{storyPrivacyNotice(notice.tool)}</Text><View className="flex-row gap-2"><DiffButton title="Enable and generate" onPress={() => controller.consent(true)} /><DiffButton title="Keep disabled" onPress={() => { controller.consent(false); setPrivacyStatus("Generation remains disabled."); }} /></View></DiffNotice> : null}
      {privacyStatus ? <Text style={{ color: mutedColor }}>{privacyStatus}</Text> : null}{copyStatus ? <Text style={{ color: mutedColor }}>{copyStatus}</Text> : null}
    </>;
    else if (item.type === "section" && result) content = <>
      <View className="flex-row items-center gap-2">{item.section.lookHere ? <SFSymbol color={diffSymbolColors.orange} name="flag.fill" size={15} /> : null}<Text accessibilityRole="header" className="flex-1" style={{ color: foregroundColor, fontSize: 18, fontWeight: "600" }}>{item.section.lookHere ? "Look here · " : ""}{item.section.title}</Text></View>
      {item.section.commit ? <Text style={{ color: mutedColor }}>{item.section.commit}</Text> : null}
      <StoryDescription markdown={item.section.description} color={foregroundColor} />
      <DiffCheckbox label="Reviewed" accessibilityLabel={`Mark reviewed: ${item.section.title}`} checked={reviewed.includes(item.section.id)} color={foregroundColor} onChange={checked => reviewStore.setReviewed(reviewKey, item.section.id, checked)} />
    </>;
    else if (item.type === "hunk") content = <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.hunk.file} hunk in Files`} onPress={() => onJumpToHunk(item.hunk, stale)}><Text style={{ color: accent, fontFamily: "Menlo", fontSize: 12 }}>{item.hunk.file} · {item.partial ? `${item.ref.side} ${item.ref.startLine}–${item.ref.endLine}` : `−${item.hunk.oldStart},${item.hunk.oldLines} +${item.hunk.newStart},${item.hunk.newLines}`} ↗</Text></Pressable>
      {item.partial ? <DiffButton variant="borderless" title={item.expanded ? "Collapse context" : "Show hunk context"} onPress={() => setExpanded(current => { const next = new Set(current); if (next.has(item.contextKey)) next.delete(item.contextKey); else next.add(item.contextKey); return next; })} /> : null}
    </>;
    else if (item.type === "list") content = <><Text accessibilityRole="header" style={{ color: foregroundColor, fontWeight: "600" }}>{item.title}</Text>{item.items.map((text, index) => <Text selectable key={index} style={{ color: foregroundColor, fontSize: 13, lineHeight: 19 }}>• {text}</Text>)}</>;
    else if (item.type === "uncovered") content = <><Text accessibilityRole="header" style={{ color: foregroundColor, fontSize: 18, fontWeight: "600" }}>Not covered by the story</Text>{item.full ? <Text style={{ color: mutedColor }}>Full coverage</Text> : null}</>;
    else if (item.type === "file") content = <><Text style={{ color: foregroundColor, fontWeight: "600" }}>{item.path}</Text>{item.note ? <Text style={{ color: mutedColor }}>{item.note}</Text> : null}</>;
    return <View className="gap-2 px-5 py-3" style={item.type === "section" || item.type === "uncovered" ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: diffSystemColor("separatorColor"), marginTop: 8 } : undefined}>{content}</View>;
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
