import { memo, useCallback, useMemo } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, type GestureResponderEvent } from "react-native";

type MouseDetails = { button?: number; ctrlKey?: boolean; metaKey?: boolean; pageX?: number; pageY?: number };
import { LegendList } from "@legendapp/list/react-native";
import type { GitHistoryCommit } from "@legend-apps/diff-parser";
import type { GitRefDecoration } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { DiffPane, type DiffLineTarget } from "./DiffPane";
import { EmptyState } from "./EmptyState";
import { commitGitHubUrl, relativeDate, searchScopes, shortOid, type CommitFile, type HistoryState } from "./gitHistory";
import { pathParts } from "./FileRow";

export const historyRowHeight = 44;
export const graphLaneWidth = 12;
/** The native layout folds lanes past this column into it. */
export const graphMaxLanes = 12;
const lineWidth = 2;
const nodeSize = 9;
const middle = historyRowHeight / 2;
// Concrete macOS system colors per appearance: React Native resolves only some PlatformColor names on
// macOS, and an unresolved one draws nothing (systemIndigoColor did). The last entry marks the overflow column.
export const laneColors = {
  light: ["#007AFF", "#AF52DE", "#FF2D55", "#FF9500", "#28CD41", "#30B0C7", "#5856D6", "#A2845E", "#FF3B30", "#FFCC00", "#00000042"],
  dark: ["#0A84FF", "#BF5AF2", "#FF375F", "#FF9F0A", "#32D74B", "#40C8E0", "#5E5CE6", "#AC8E68", "#FF453A", "#FFD60A", "#FFFFFF40"],
};
type LanePalette = readonly string[];
const laneX = (column: number) => column * graphLaneWidth + graphLaneWidth / 2;
/** A lane's color: one of the palette's lane colors by index, or the overflow color past the cap. */
export const laneColor = (palette: LanePalette, column: number, color: number) => palette[column >= graphMaxLanes ? palette.length - 1 : color % (palette.length - 1)]!;

/** Columns the graph needs for these rows (at most the cap plus its overflow column). */
export function graphColumns(commits: readonly GitHistoryCommit[]) {
  let columns = 0;
  for (const commit of commits) {
    columns = Math.max(columns, commit.lane + 1);
    for (let index = 0; index < commit.edges.length; index += 3) columns = Math.max(columns, commit.edges[index]! + 1, commit.edges[index + 1]! + 1);
  }
  return Math.min(columns, graphMaxLanes + 1);
}

/**
 * One row's slice of the commit graph: lines enter at the top edge and leave at the bottom edge at
 * their lane, and bend into the commit's node with a rounded corner.
 */
export const GraphCell = memo(function GraphCell({ commit, columns, palette }: { commit: GitHistoryCommit; columns: number; palette: LanePalette }) {
  const node = laneX(commit.lane);
  const segments = [];
  for (let index = 0; index < commit.edges.length; index += 3) {
    const top = commit.edges[index]!, bottom = commit.edges[index + 1]!;
    const column = top >= 0 ? top : bottom;
    const color = laneColor(palette, column, commit.edges[index + 2]!);
    const x = laneX(column);
    const key = `${top}:${bottom}`;
    if (top === bottom || column === commit.lane) {
      const y = top === bottom ? 0 : top >= 0 ? 0 : middle;
      segments.push(<View key={key} style={[styles.line, { left: x - lineWidth / 2, top: y, height: top === bottom ? historyRowHeight : middle, backgroundColor: color }]} />);
      continue;
    }
    const right = x > node;
    const width = Math.abs(x - node) + lineWidth / 2;
    const corner = Math.min(6, Math.abs(x - node));
    segments.push(<View key={key} style={[styles.bend, {
      left: right ? node : x - lineWidth / 2, width, borderColor: color,
      ...top >= 0
        ? { top: -lineWidth / 2, height: middle + lineWidth, borderBottomWidth: lineWidth, [right ? "borderRightWidth" : "borderLeftWidth"]: lineWidth, [right ? "borderBottomRightRadius" : "borderBottomLeftRadius"]: corner }
        : { top: middle - lineWidth / 2, height: middle + lineWidth, borderTopWidth: lineWidth, [right ? "borderRightWidth" : "borderLeftWidth"]: lineWidth, [right ? "borderTopRightRadius" : "borderTopLeftRadius"]: corner },
    }]} />);
  }
  const color = laneColor(palette, commit.lane, commit.color);
  const merge = commit.parents.length > 1;
  return <View style={[styles.graph, { width: columns * graphLaneWidth }]} accessible={false} importantForAccessibility="no-hide-descendants">
    {segments}
    <View style={[styles.node, { left: node - nodeSize / 2, borderColor: color, backgroundColor: merge ? PlatformColor("controlBackgroundColor") : color }]} />
    {commit.lane >= graphMaxLanes ? <Text style={[styles.overflow, { left: laneX(graphMaxLanes) + nodeSize / 2 }]}>…</Text> : null}
  </View>;
});

export type HistoryActions = {
  select(oid: string): void;
  loadMore(): void;
  selectFile(path: string): void;
  copySha(oid: string): void;
  openOnGitHub(oid: string): void;
  /** Right-click or Control-click on a row, in window coordinates. */
  contextMenu(oid: string, position: { x: number; y: number }): void;
  /** Right-click on a changed file of the selected commit, in window coordinates. */
  fileContextMenu(path: string, position: { x: number; y: number }): void;
  closeFileHistory(): void;
  /** Command-click: compares the selected commit with this one. */
  compare(oid: string): void;
  swapCompare(): void;
  closeCompare(): void;
  /** The line clicked last in a commit's or comparison's diff, with the revision its side was blamed as of. */
  lineChange(target: BlameTarget | null): void;
  lineContextMenu(target: BlameTarget, position: { x: number; y: number }): void;
};

/** A diff line and the revision to blame it as of: a commit, "index" or "workdir". */
export type BlameTarget = DiffLineTarget & { source: string };

type RowCommit = Pick<GitHistoryCommit, "oid" | "summary" | "authorName" | "time"> & Partial<Pick<GitHistoryCommit, "lane" | "color" | "edges" | "parents">> & { path?: string };

const refOrder = { branch: 0, remote: 1, tag: 2 } as const;

/** Ref names as plain text after the subject ("main, origin/main, v1.0"); the current branch is in label color, semibold. */
function RefNames({ refs, currentBranch, selected }: { refs: GitRefDecoration[]; currentBranch: string | null; selected: boolean }) {
  const sorted = [...refs].sort((a, b) => refOrder[a.kind] - refOrder[b.kind] || a.name.localeCompare(b.name));
  return <Text style={[styles.refs, selected && styles.textSelected]} numberOfLines={1}>
    {sorted.map((ref, index) => <Text key={`${ref.kind}:${ref.name}`} style={ref.kind === "branch" && ref.name === currentBranch ? [styles.currentRef, selected && styles.textSelected] : undefined}>
      {index ? ", " : ""}{ref.name}
    </Text>)}
  </Text>;
}

const CommitRow = memo(function CommitRow({ commit, columns, palette, path, selected, refs, currentBranch, onSelect, onCompare, onContextMenu }: {
  commit: RowCommit; columns: number; palette: LanePalette; path?: string; selected: boolean; refs: GitRefDecoration[] | undefined; currentBranch: string | null;
  onSelect: (oid: string) => void; onCompare: (oid: string) => void; onContextMenu: (oid: string, position: { x: number; y: number }) => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${commit.summary}, ${shortOid(commit.oid)}${refs?.length ? `, ${refs.map(ref => ref.name).join(", ")}` : ""}`} accessibilityState={{ selected }}
    style={[styles.row, selected && styles.rowSelected]}
    onPress={event => {
      const mouse = event.nativeEvent as MouseDetails;
      if (mouse.ctrlKey) return;
      if (mouse.metaKey) onCompare(commit.oid);
      else onSelect(commit.oid);
    }}
    // Pressability only presses for the primary button, so the context menu comes from the raw touch end.
    onTouchEnd={(event: GestureResponderEvent) => {
      const mouse = event.nativeEvent as MouseDetails;
      if (mouse.button === 2 || mouse.ctrlKey) onContextMenu(commit.oid, { x: mouse.pageX ?? 0, y: mouse.pageY ?? 0 });
    }}>
    {columns ? <GraphCell commit={commit as GitHistoryCommit} columns={columns} palette={palette} /> : null}
    <View style={styles.rowText}>
      <View style={styles.rowLine}>
        <Text style={[styles.summary, selected && styles.textSelected]} numberOfLines={1}>{commit.summary || "(no message)"}</Text>
        {refs?.length ? <RefNames refs={refs} currentBranch={currentBranch} selected={selected} /> : null}
      </View>
      <View style={styles.rowLine}>
        <Text style={[styles.sha, selected && styles.textSelected]}>{shortOid(commit.oid)}</Text>
        <Text style={[styles.meta, selected && styles.textSelected]} numberOfLines={1}>{commit.path && commit.path !== path ? `${commit.authorName} · ${commit.path}` : commit.authorName}</Text>
        <Text style={[styles.date, selected && styles.textSelected]} numberOfLines={1}>{relativeDate(commit.time)}</Text>
      </View>
    </View>
  </Pressable>;
});

/** History's list column: the commit list with its graph, one file's history, or the unborn/loading state. */
/** `memory` keeps the scroll offset across a remount (the layout moving the pane), by panel instance id. */
export function HistoryList({ history, actions, memory }: { history: HistoryState; actions: HistoryActions; memory?: { key?: string; scrollOffset: number } }) {
  const { commits, refs, selectedOid, currentBranch, file, search, compare, range } = history;
  const onSelect = useCallback((oid: string) => actions.select(oid), [actions]);
  const onCompare = useCallback((oid: string) => actions.compare(oid), [actions]);
  const onContextMenu = useCallback((oid: string, position: { x: number; y: number }) => actions.contextMenu(oid, position), [actions]);
  const columns = useMemo(() => graphColumns(commits), [commits]);
  const palette = laneColors[useColorScheme() === "dark" ? "dark" : "light"];
  // A new object whenever selection, refs, the graph width or the appearance change, so recycled rows redraw.
  const extraData = useMemo(() => ({ selectedOid, refs, currentBranch, columns, palette, compare }), [selectedOid, refs, currentBranch, columns, palette, compare]);

  if (history.head?.unborn) return <EmptyState title="No Commits Yet" message="Make the first commit from Changes." />;
  if (!history.head) return history.error ? <Text accessibilityRole="alert" style={styles.error}>{history.error}</Text> : <EmptyState title="Loading History…" />;
  const listId = search ? `search:${search.scope}:${search.text}` : file?.path ?? (range ? `range:${range.base}..${history.ref}` : undefined);
  // A remembered offset applies only to the same list (the log of the same ref, or the same search, file or range).
  const listKey = listId ?? `log:${history.ref ?? ""}`;
  const folder = file && pathParts(file.path);
  const filter = search ?? file ?? range;
  const scopeLabel = search && searchScopes.find(entry => entry.scope === search.scope)!.label;
  const highlighted = (oid: string) => compare ? oid === compare.base || oid === compare.target : oid === selectedOid;
  return <View style={styles.list}>
    {search ? <View style={styles.heading}>
      <View style={styles.headingText}>
        <Text style={styles.headingLabel} accessibilityRole="header" numberOfLines={1}>{`Search: “${search.text}”`}</Text>
        <Text style={styles.headingFolder} numberOfLines={1}>{search.loading ? `Searching ${scopeLabel!.toLowerCase()}…` : `${search.commits.length}${search.done ? "" : "+"} in ${scopeLabel}`}</Text>
      </View>
      <Button style={styles.showAll} onPress={() => actions.closeFileHistory()}>Show All</Button>
    </View> : file && folder ? <View style={styles.heading}>
      <View style={styles.headingText}>
        <Text style={styles.headingLabel} accessibilityRole="header" numberOfLines={1}>File History: {folder.name}</Text>
        {folder.folder ? <Text style={styles.headingFolder} numberOfLines={1}>{folder.folder}</Text> : null}
      </View>
      <Button style={styles.showAll} onPress={() => actions.closeFileHistory()}>Show All</Button>
    </View> : null}
    {(filter ?? history).error ? <Text accessibilityRole="alert" style={styles.error}>{(filter ?? history).error}</Text> : null}
    {search?.loading && !search.commits.length ? <EmptyState title="Searching…" />
      : search && !search.commits.length ? search.error ? null : <EmptyState title="No Results" message={`No commit matches in ${scopeLabel!.toLowerCase()}.`} />
      : file?.loading ? <EmptyState title="Loading File History…" />
      : file && !file.commits.length ? <EmptyState title="No History" message="No commit touched this file." />
      : range?.loading && !range.commits.length ? <EmptyState title="Loading Commits…" />
      : range && !range.commits.length ? range.error ? null : <EmptyState symbol="checkmark.circle" title="Nothing to Push" message="Every commit is on the upstream already." />
      : <LegendList<RowCommit>
        key={listId}
        data={filter ? filter.commits : commits}
        keyExtractor={item => item.oid}
        estimatedItemSize={historyRowHeight}
        getFixedItemSize={() => historyRowHeight}
        extraData={extraData}
        recycleItems
        onEndReached={() => actions.loadMore()}
        onEndReachedThreshold={2}
        initialScrollOffset={memory?.key === listKey ? memory.scrollOffset : undefined}
        onScroll={memory ? event => { memory.key = listKey; memory.scrollOffset = event.nativeEvent.contentOffset.y; } : undefined}
        renderItem={({ item }) => <CommitRow commit={item} columns={filter ? 0 : columns} palette={palette} path={file?.path} selected={highlighted(item.oid)} refs={refs.get(item.oid)} currentBranch={currentBranch} onSelect={onSelect} onCompare={onCompare} onContextMenu={onContextMenu} />}
        ListFooterComponent={(filter ?? history).done ? null : <Text style={styles.footer}>Loading more…</Text>}
      />}
  </View>;
}

/** History's detail pane: the selected commit's header, message, changed files and the selected file's patch. */
/** The commitDetails panel: the selected commit's subject, SHA and metadata, or the two commits being compared. */
export function CommitInfo({ history, actions }: { history: HistoryState; actions: HistoryActions }) {
  const { details, compare } = history;
  if (compare) {
    return <View style={styles.details}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.subject} accessibilityRole="header" numberOfLines={1}>{`Comparing ${shortOid(compare.base)} → ${shortOid(compare.target)}`}</Text>
          <Text style={styles.compareLine} numberOfLines={1} selectable>{`From ${commitLabel(history, compare.base)}`}</Text>
          <Text style={styles.compareLine} numberOfLines={1} selectable>{`To ${commitLabel(history, compare.target)}`}</Text>
        </View>
        <Button style={styles.action} onPress={() => actions.swapCompare()}>Swap</Button>
        <Button style={styles.action} onPress={() => actions.closeCompare()}>Done</Button>
      </View>
      {compare.error ? <Text accessibilityRole="alert" style={styles.error}>{compare.error}</Text> : null}
    </View>;
  }
  if (!details) return <View style={styles.details} />;
  if (details.error) return <Text accessibilityRole="alert" style={styles.error}>{details.error}</Text>;
  const commit = details.commit;
  if (!commit) return <EmptyState title="Loading Commit…" />;
  const body = commit.message.split("\n").slice(1).join("\n").replace(/^\n+/, "");
  const sameCommitter = commit.committer.name === commit.author.name && commit.committer.email === commit.author.email && commit.committer.time === commit.author.time;
  const date = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return <View style={styles.details}>
    <View style={styles.header}>
      <View style={styles.headerTitle}>
        <Text style={styles.subject} selectable>{commit.message.split("\n")[0]}</Text>
        <Text style={styles.oid} selectable>{commit.oid}</Text>
      </View>
      <Button style={styles.action} onPress={() => actions.copySha(commit.oid)}>Copy SHA</Button>
      {commitGitHubUrl(history, commit.oid) ? <Button style={styles.wideAction} onPress={() => actions.openOnGitHub(commit.oid)}>Open on GitHub</Button> : null}
    </View>
    <ScrollView style={styles.fill} contentContainerStyle={styles.meta2}>
      <Field label="Author" value={`${commit.author.name} <${commit.author.email}>  ${date(commit.author.time)}`} />
      {sameCommitter ? null : <Field label="Committer" value={`${commit.committer.name} <${commit.committer.email}>  ${date(commit.committer.time)}`} />}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{commit.parents.length > 1 ? "Parents" : "Parent"}</Text>
        {commit.parents.length ? commit.parents.map(parent => <Pressable key={parent} accessibilityRole="link" accessibilityLabel={`Parent ${shortOid(parent)}`} onPress={() => actions.select(parent)}>
          <Text style={styles.link}>{shortOid(parent)}</Text>
        </Pressable>) : <Text style={styles.fieldValue}>None (root commit)</Text>}
      </View>
      {body ? <Text style={styles.body} selectable>{body}</Text> : null}
    </ScrollView>
  </View>;
}

/** The fileList panel in History: the selected commit's files, or the files two compared commits differ in. */
export function CommitFiles({ history, actions }: { history: HistoryState; actions: HistoryActions }) {
  const { details, compare } = history;
  const source = compare ? (compare.loading || compare.error ? null : compare) : details?.commit ? details : null;
  if (!source) return <View style={styles.details} />;
  const merge = !compare && (details?.commit?.parents.length ?? 0) > 1;
  if (compare && !source.files.length) return <EmptyState title="No Differences" message="The two commits have the same files." />;
  return <View style={styles.details}>
    <Text style={styles.filesHeading}>{source.files.length === 1 ? "1 changed file" : `${source.files.length} changed files`}{merge ? " (compared with the first parent)" : ""}</Text>
    {source.files.length ? <Sidebar style={styles.fill} selectedId={source.selectedPath} onSelectionChange={event => { if (event.id) actions.selectFile(event.id); }} defaultRowHeight={24}>
      {source.files.map(entry => <SidebarItem key={entry.path} id={entry.path} onContextMenu={event => actions.fileContextMenu(entry.path, event.windowPosition)}>
        <Text style={styles.file} numberOfLines={1}>{entry.file.oldPath && entry.file.newPath && entry.file.oldPath !== entry.file.newPath ? `${entry.file.oldPath} → ${entry.file.newPath}` : entry.path}</Text>
      </SidebarItem>)}
    </Sidebar> : null}
  </View>;
}

/** The diff panel in History: the selected file of the selected commit, or of the comparison. */
export function CommitFileDiff({ history, actions }: { history: HistoryState; actions: HistoryActions }) {
  const { details, compare } = history;
  if (compare) {
    if (compare.loading) return <EmptyState title="Comparing…" />;
    const file = compare.files.find(entry => entry.path === compare.selectedPath);
    return file ? <CommitDiff file={file} actions={actions} oldSource={compare.base} newSource={compare.target} /> : <EmptyState title="No Selection" message="Select a file to see its changes." />;
  }
  const commit = details?.commit;
  const file = commit ? details.files.find(entry => entry.path === details.selectedPath) : undefined;
  if (!commit || !file) return <EmptyState title="No Selection" message={commit ? "Select a file to see its changes." : "Select a commit to see its details."} />;
  return <CommitDiff file={file} actions={actions} oldSource={commit.parents[0]} newSource={commit.oid} />;
}

/** A read-only diff whose lines blame as of `newSource` (added and context lines) or `oldSource` (removed lines). */
function CommitDiff({ file, actions, oldSource, newSource }: { file: CommitFile; actions: HistoryActions; oldSource: string | undefined; newSource: string }) {
  const source = (target: DiffLineTarget) => target.side === "old" ? oldSource : newSource;
  return <DiffPane readOnly disabled patch={{ path: file.path, text: file.text, file: file.file, section: "unstaged", conflicted: false }} onApply={() => {}}
    onLineChange={target => { const from = target && source(target); actions.lineChange(target && from ? { ...target, source: from } : null); }}
    onLineContextMenu={(target, position) => { const from = source(target); if (from) actions.lineContextMenu({ ...target, source: from }, position); }} />;
}

function commitLabel(history: HistoryState, oid: string) {
  const summary = listedSummary(history, oid);
  return summary ? `${shortOid(oid)} ${summary}` : shortOid(oid);
}
const listedSummary = (history: HistoryState, oid: string) =>
  (history.search?.commits.find(commit => commit.oid === oid) ?? history.file?.commits.find(commit => commit.oid === oid) ?? history.range?.commits.find(commit => commit.oid === oid) ?? history.commits.find(commit => commit.oid === oid))?.summary;

function Field({ label, value }: { label: string; value: string }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue} selectable numberOfLines={1}>{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  details: { flex: 1 },
  fill: { flex: 1 },
  error: { padding: 12, fontSize: 13, color: PlatformColor("systemRedColor") },
  footer: { padding: 12, fontSize: 12, textAlign: "center", color: PlatformColor("secondaryLabelColor") },
  row: { height: historyRowHeight, flexDirection: "row", gap: 6, paddingHorizontal: 8, marginHorizontal: 6, borderRadius: 5 },
  rowText: { flex: 1, justifyContent: "center", gap: 2 },
  graph: { height: historyRowHeight },
  line: { position: "absolute", width: lineWidth },
  bend: { position: "absolute" },
  node: { position: "absolute", top: middle - nodeSize / 2, width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2, borderWidth: lineWidth },
  overflow: { position: "absolute", top: middle - 8, fontSize: 11, color: PlatformColor("tertiaryLabelColor") },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingLeft: 16, paddingRight: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  headingText: { flex: 1 },
  headingLabel: { fontSize: 12, fontWeight: "600", color: PlatformColor("labelColor") },
  headingFolder: { fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  showAll: { width: 80, height: 24 },
  rowSelected: { backgroundColor: PlatformColor("selectedContentBackgroundColor") },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  summary: { flexShrink: 1, fontSize: 13, color: PlatformColor("labelColor") },
  sha: { fontSize: 11, fontFamily: "Menlo", color: PlatformColor("secondaryLabelColor") },
  meta: { flex: 1, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  date: { fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  textSelected: { color: PlatformColor("alternateSelectedControlTextColor") },
  refs: { flexShrink: 2, maxWidth: "50%", fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  currentRef: { fontWeight: "600", color: PlatformColor("labelColor") },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  headerTitle: { flex: 1, gap: 2 },
  subject: { fontSize: 14, fontWeight: "600", color: PlatformColor("labelColor") },
  oid: { fontSize: 11, fontFamily: "Menlo", color: PlatformColor("secondaryLabelColor") },
  compareLine: { fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  action: { width: 96, height: 28 },
  wideAction: { width: 128, height: 28 },
  meta2: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  field: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldLabel: { width: 72, fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  fieldValue: { flex: 1, fontSize: 12, color: PlatformColor("labelColor") },
  link: { fontSize: 12, fontFamily: "Menlo", color: PlatformColor("linkColor") },
  body: { marginTop: 6, fontSize: 12, color: PlatformColor("labelColor") },
  filesHeading: { paddingHorizontal: 16, paddingVertical: 6, fontSize: 12, fontWeight: "600", color: PlatformColor("secondaryLabelColor") },
  file: { flex: 1, paddingHorizontal: 8, fontSize: 12, color: PlatformColor("labelColor") },
});
