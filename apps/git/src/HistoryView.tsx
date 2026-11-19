import { memo, useCallback, useMemo, type ReactNode } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

type MouseDetails = { button?: number; ctrlKey?: boolean; metaKey?: boolean; pageX?: number; pageY?: number };
import { LegendList } from "@legendapp/list/react-native";
import type { GitHistoryCommit } from "@legend-apps/diff-parser";
import type { GitRefDecoration } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { DiffPane, type DiffLineTarget } from "./DiffPane";
import { EmptyState } from "./EmptyState";
import { commitGitHubUrl, relativeDate, shortOid, type CommitFile, type HistoryState } from "./gitHistory";
import { pathParts } from "./FileRow";
import { folderItem, useFileList } from "./fileList";
import { useDensity, usePanelOptions, useThemeTokens } from "./settings/panelOptions";
import type { PanelOptions } from "./settings/schema";
import { defaultSettings } from "./settings/defaults";
import { densityHeights, type ResolvedTheme } from "./settings/theme";

type CommitListOptions = PanelOptions["commitList"];
type ColumnId = CommitListOptions["columns"][number]["id"];
const defaultGraph = defaultSettings.panels.commitList.graph;
/** The default graph lane cap (`panels.commitList.graph.maxLanes`); lanes past it fold into the overflow column. */
export const graphMaxLanes = defaultGraph.maxLanes;
const nodeSize = 9;
// Concrete macOS system colors per appearance (the defaults' `theme.<appearance>.lanes`): React Native resolves only
// some PlatformColor names on macOS, and an unresolved one draws nothing. The last entry marks the overflow column.
export const laneColors = { light: defaultSettings.theme.light.lanes, dark: defaultSettings.theme.dark.lanes };
type LanePalette = readonly string[];

/** Everything the graph cells draw with. One object per list, new only when one of these changes (spec §7 item 4). */
export type GraphStyle = Readonly<{ laneWidth: number; lineWidth: number; nodeStyle: "dot" | "ring"; maxLanes: number; colorBy: "lane" | "branch"; rowHeight: number; palette: LanePalette }>;
export const graphStyle = (graph: CommitListOptions["graph"], rowHeight: number, palette: LanePalette): GraphStyle =>
  ({ laneWidth: graph.laneWidth, lineWidth: graph.lineWidth, nodeStyle: graph.nodeStyle, maxLanes: graph.maxLanes, colorBy: graph.colorBy, rowHeight, palette });

/**
 * A lane's color: past the cap the overflow color (the palette's last), else a lane color by the lane's column
 * (`colorBy: "lane"`) or by the branch color index the graph layout assigned (`"branch"`, kept along a branch).
 */
export const laneColor = (palette: LanePalette, column: number, color: number, maxLanes = graphMaxLanes, colorBy: "lane" | "branch" = "branch") =>
  palette[column >= maxLanes ? palette.length - 1 : (colorBy === "lane" ? column : color) % (palette.length - 1)]!;

/** Columns the graph needs for these rows (at most the cap plus its overflow column). */
export function graphColumns(commits: readonly GitHistoryCommit[], maxLanes = graphMaxLanes) {
  let columns = 0;
  for (const commit of commits) {
    columns = Math.max(columns, commit.lane + 1);
    for (let index = 0; index < commit.edges.length; index += 3) columns = Math.max(columns, commit.edges[index]! + 1, commit.edges[index + 1]! + 1);
  }
  return Math.min(columns, maxLanes + 1);
}

/**
 * One row's slice of the commit graph: lines enter at the top edge and leave at the bottom edge at
 * their lane, and bend into the commit's node with a rounded corner.
 */
export const GraphCell = memo(function GraphCell({ commit, columns, graph }: { commit: GitHistoryCommit; columns: number; graph: GraphStyle }) {
  const { laneWidth, lineWidth, rowHeight, palette, maxLanes, colorBy } = graph;
  const laneX = (column: number) => column * laneWidth + laneWidth / 2;
  const middle = rowHeight / 2;
  const node = laneX(commit.lane);
  const segments = [];
  for (let index = 0; index < commit.edges.length; index += 3) {
    const top = commit.edges[index]!, bottom = commit.edges[index + 1]!;
    const column = top >= 0 ? top : bottom;
    const color = laneColor(palette, column, commit.edges[index + 2]!, maxLanes, colorBy);
    const x = laneX(column);
    const key = `${top}:${bottom}`;
    if (top === bottom || column === commit.lane) {
      const y = top === bottom ? 0 : top >= 0 ? 0 : middle;
      segments.push(<View key={key} style={[styles.line, { left: x - lineWidth / 2, top: y, width: lineWidth, height: top === bottom ? rowHeight : middle, backgroundColor: color }]} />);
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
  const color = laneColor(palette, commit.lane, commit.color, maxLanes, colorBy);
  const hollow = graph.nodeStyle === "ring" || commit.parents.length > 1;
  return <View style={[styles.graph, { width: columns * laneWidth, height: rowHeight }]} accessible={false} importantForAccessibility="no-hide-descendants">
    {segments}
    <View style={[styles.node, { left: node - nodeSize / 2, top: middle - nodeSize / 2, borderWidth: Math.max(1.5, lineWidth), borderColor: color, backgroundColor: hollow ? PlatformColor("controlBackgroundColor") : color }]} />
    {commit.lane >= maxLanes ? <Text style={[styles.overflow, { top: middle - 8, left: laneX(maxLanes) + nodeSize / 2 }]}>…</Text> : null}
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
  /** Right-click on the column titles: the column menu for these (effective) columns, in window coordinates. */
  columnMenu?(columns: PanelOptions["commitList"]["columns"], position: { x: number; y: number }): void;
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
const refSymbols = { branch: "arrow.triangle.branch", remote: "cloud", tag: "tag" } as const;

/** The refs a commit list shows: remote branches and tags only when its options say so. */
export function visibleRefs(refs: ReadonlyMap<string, GitRefDecoration[]>, options: Pick<CommitListOptions, "showRemoteRefs" | "showTags" | "refs">): ReadonlyMap<string, GitRefDecoration[]> {
  if (options.refs === "hidden") return new Map();
  if (options.showRemoteRefs && options.showTags) return refs;
  const out = new Map<string, GitRefDecoration[]>();
  for (const [oid, list] of refs) {
    const kept = list.filter(ref => (options.showRemoteRefs || ref.kind !== "remote") && (options.showTags || ref.kind !== "tag"));
    if (kept.length) out.set(oid, kept);
  }
  return out;
}

/** A commit time (seconds) in the list's date format. */
export function formatCommitDate(seconds: number, format: CommitListOptions["dateFormat"], now = Date.now()) {
  const date = new Date(seconds * 1000);
  if (format === "relative") return relativeDate(seconds, now);
  if (format === "iso") return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  return date.toLocaleString(undefined, format === "short" ? { dateStyle: "short" } : { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Ref names: plain text ("main, origin/main, v1.0", the current branch in label color, semibold), or with
 * `refStyle: "tinted"` each name in its theme ref color after a small SF Symbol (spec D4: no capsules).
 */
function RefNames({ refs, currentBranch, selected, tinted, colors, column }: { refs: GitRefDecoration[]; currentBranch: string | null; selected: boolean; tinted: boolean; colors: ResolvedTheme["refs"]; column: boolean }) {
  const sorted = [...refs].sort((a, b) => refOrder[a.kind] - refOrder[b.kind] || a.name.localeCompare(b.name));
  const current = (ref: GitRefDecoration) => ref.kind === "branch" && ref.name === currentBranch;
  if (tinted) {
    // Inline, refs give way to the subject (at most half the row); in the refs column they have the column.
    return <View style={[styles.tintedRefs, column && styles.refsColumn]}>
      {sorted.map(ref => {
        const color = selected ? undefined : current(ref) ? colors.head : ref.kind === "branch" ? colors.localBranch : ref.kind === "remote" ? colors.remoteBranch : colors.tag;
        return <View key={`${ref.kind}:${ref.name}`} style={styles.tintedRef}>
          <SFSymbol name={refSymbols[ref.kind]} size={10} color={color ?? "#FFFFFF"} />
          <Text style={[styles.refName, color ? { color } : styles.textSelected, current(ref) && styles.currentWeight]} numberOfLines={1}>{ref.name}</Text>
        </View>;
      })}
    </View>;
  }
  return <Text style={[styles.refs, column && styles.refsColumn, selected && styles.textSelected]} numberOfLines={1}>
    {sorted.map((ref, index) => <Text key={`${ref.kind}:${ref.name}`} style={current(ref) ? [styles.currentRef, selected && styles.textSelected] : undefined}>
      {index ? ", " : ""}{ref.name}
    </Text>)}
  </Text>;
}

/** What every row of one list shares: columns, graph, ref and date options. New only when one of them changes. */
type RowLayout = Readonly<{
  columns: readonly { id: ColumnId; width?: number }[]; graph: GraphStyle; graphColumns: number;
  refs: CommitListOptions["refs"]; tinted: boolean; refColors: ResolvedTheme["refs"]; dateFormat: CommitListOptions["dateFormat"];
}>;

/** A column's width when the settings give none (the subject flexes; the graph fits its lanes). */
const defaultWidths: Partial<Record<ColumnId, number>> = { refs: 160, author: 140, committer: 140, date: 120, sha: 64 };

/** The visible columns in display order; the subject always shows (it is the row's flexible column). */
export function visibleColumns(columns: CommitListOptions["columns"]) {
  const shown = columns.filter(column => column.visible !== false);
  return shown.some(column => column.id === "subject") ? shown : [...shown, { id: "subject" as const }];
}

const CommitRow = memo(function CommitRow({ commit, layout, path, selected, refs, currentBranch, onSelect, onCompare, onContextMenu }: {
  commit: RowCommit; layout: RowLayout; path?: string; selected: boolean; refs: GitRefDecoration[] | undefined; currentBranch: string | null;
  onSelect: (oid: string) => void; onCompare: (oid: string) => void; onContextMenu: (oid: string, position: { x: number; y: number }) => void;
}) {
  const refNames = refs?.length ? <RefNames refs={refs} currentBranch={currentBranch} selected={selected} tinted={layout.tinted} colors={layout.refColors} column={layout.refs === "column"} /> : null;
  const secondary = [styles.secondary, selected && styles.textSelected];
  const cell = (id: ColumnId, width: number | undefined): ReactNode => {
    switch (id) {
      case "graph": return layout.graphColumns ? <View key={id} style={[styles.cell, { width: width ?? layout.graphColumns * layout.graph.laneWidth }]}>
        <GraphCell commit={commit as GitHistoryCommit} columns={layout.graphColumns} graph={layout.graph} />
      </View> : null;
      case "refs": return <View key={id} style={[styles.cell, { width: width ?? defaultWidths.refs }]}>{layout.refs === "column" ? refNames : null}</View>;
      case "subject": return <View key={id} style={[styles.subjectCell, width === undefined ? styles.flexible : { width }]}>
        {layout.refs === "inline" ? refNames : null}
        <Text style={[styles.summary, selected && styles.textSelected]} numberOfLines={1}>{commit.summary || "(no message)"}</Text>
      </View>;
      case "author": case "committer": return <Text key={id} style={[...secondary, { width: width ?? defaultWidths[id] }]} numberOfLines={1}>{commit.path && commit.path !== path ? `${commit.authorName} · ${commit.path}` : commit.authorName}</Text>;
      case "date": return <Text key={id} style={[...secondary, { width: width ?? defaultWidths.date }]} numberOfLines={1}>{formatCommitDate(commit.time, layout.dateFormat)}</Text>;
      case "sha": return <Text key={id} style={[styles.sha, selected && styles.textSelected, { width: width ?? defaultWidths.sha }]} numberOfLines={1}>{shortOid(commit.oid)}</Text>;
    }
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={`${commit.summary}, ${shortOid(commit.oid)}${refs?.length ? `, ${refs.map(ref => ref.name).join(", ")}` : ""}`} accessibilityState={{ selected }}
    style={[styles.row, { height: layout.graph.rowHeight }, selected && styles.rowSelected]}
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
    {layout.columns.map(column => cell(column.id, column.width))}
  </Pressable>;
});

export const columnTitles: Record<ColumnId, string> = { graph: "Graph", refs: "Branches and Tags", subject: "Description", author: "Author", committer: "Committer", date: "Date", sha: "Commit" };
const allColumns = Object.keys(columnTitles) as ColumnId[];

/** The commit list header's context menu: every column with a checkmark when shown (the subject always is), then Reset Columns. */
export function columnMenuItems(columns: CommitListOptions["columns"]) {
  const shown = new Set(visibleColumns(columns).map(column => column.id));
  return [
    ...allColumns.map(id => ({ type: "checkbox" as const, id: `column:${id}`, label: columnTitles[id], checked: shown.has(id), disabled: id === "subject" })),
    { type: "separator" as const },
    { type: "action" as const, id: "column:reset", label: "Reset Columns" },
  ];
}

/** The columns after a header menu choice: a listed column toggles in place, an unlisted one is added at the end; Reset is undefined (back to the preset's). */
export function applyColumnMenu(columns: CommitListOptions["columns"], itemId: string): CommitListOptions["columns"] | undefined {
  if (itemId === "column:reset") return undefined;
  const id = itemId.slice("column:".length) as ColumnId;
  if (id === "subject" || !allColumns.includes(id)) return columns;
  const at = columns.findIndex(column => column.id === id);
  if (at < 0) return [...columns, { id }];
  return columns.map((column, index) => {
    if (index !== at) return column;
    const { visible, ...rest } = column;
    return visible === false ? rest : { ...rest, visible: false };
  });
}

/** The column titles; right-click opens the column menu (`actions.columnMenu`), which edits the user settings. */
function ColumnHeader({ layout, columns, onMenu }: { layout: RowLayout; columns: CommitListOptions["columns"]; onMenu?: HistoryActions["columnMenu"] }) {
  const width = (id: ColumnId, own: number | undefined) => own ?? (id === "graph" ? layout.graphColumns * layout.graph.laneWidth : defaultWidths[id]);
  return <Pressable style={styles.columnHeader} accessibilityRole="header" accessibilityLabel="Columns"
    onTouchEnd={(event: GestureResponderEvent) => {
      const mouse = event.nativeEvent as MouseDetails;
      if (mouse.button === 2 || mouse.ctrlKey) onMenu?.(columns, { x: mouse.pageX ?? 0, y: mouse.pageY ?? 0 });
    }}>
    {layout.columns.map(({ id, width: own }) => id === "graph" && !layout.graphColumns ? null
      : <Text key={id} style={[styles.columnTitle, id === "subject" && own === undefined ? styles.flexible : { width: width(id, own) }]} numberOfLines={1}>{columnTitles[id]}</Text>)}
  </Pressable>;
}

/** History's list column: the commit list with its graph, one file's history, or the unborn/loading state. */
/** `memory` keeps the scroll offset across a remount (the layout moving the pane), by panel instance id. */
export function HistoryList({ history, actions, memory }: { history: HistoryState; actions: HistoryActions; memory?: { key?: string; scrollOffset: number } }) {
  const { commits, refs, selectedOid, currentBranch, file, search, compare, range } = history;
  const options = usePanelOptions("commitList");
  const density = useDensity(options.density);
  const palette = useThemeTokens("lanes");
  const refColors = useThemeTokens("refs");
  const onSelect = useCallback((oid: string) => actions.select(oid), [actions]);
  const onCompare = useCallback((oid: string) => actions.compare(oid), [actions]);
  const onContextMenu = useCallback((oid: string, position: { x: number; y: number }) => actions.contextMenu(oid, position), [actions]);
  const rowHeight = densityHeights[density].row;
  const columns = useMemo(() => graphColumns(commits, options.graph.maxLanes), [commits, options.graph.maxLanes]);
  const graph = useMemo(() => graphStyle(options.graph, rowHeight, palette), [options.graph, rowHeight, palette]);
  const shownRefs = useMemo(() => visibleRefs(refs, options), [refs, options.refs, options.showRemoteRefs, options.showTags]); // eslint-disable-line react-hooks/exhaustive-deps -- only these options filter
  const filtering = !!(search ?? file ?? range);
  const layout = useMemo<RowLayout>(() => ({
    columns: visibleColumns(options.columns), graph, graphColumns: filtering ? 0 : columns,
    refs: options.refs, tinted: options.refStyle === "tinted", refColors, dateFormat: options.dateFormat,
  }), [options.columns, graph, filtering, columns, options.refs, options.refStyle, refColors, options.dateFormat]);
  // A new object whenever selection, refs or the row layout change, so recycled rows redraw.
  const extraData = useMemo(() => ({ selectedOid, shownRefs, currentBranch, layout, compare }), [selectedOid, shownRefs, currentBranch, layout, compare]);

  if (history.head?.unborn) return <EmptyState title="No Commits Yet" message="Make the first commit from Changes." />;
  if (!history.head) return history.error ? <Text accessibilityRole="alert" style={styles.error}>{history.error}</Text> : <EmptyState title="Loading History…" />;
  const listId = search ? `search:${search.text}` : file?.path ?? (range ? `range:${range.base}..${history.ref}` : undefined);
  // A remembered offset applies only to the same list (the log of the same ref, or the same search, file or range).
  const listKey = listId ?? `log:${history.ref ?? ""}`;
  const folder = file && pathParts(file.path);
  const filter = search ?? file ?? range;
  const highlighted = (oid: string) => compare ? oid === compare.base || oid === compare.target : oid === selectedOid;
  return <View style={styles.list}>
    {search ? <View style={styles.heading}>
      <View style={styles.headingText}>
        <Text style={styles.headingLabel} accessibilityRole="header" numberOfLines={1}>{`Search: “${search.text}”`}</Text>
        <Text style={styles.headingFolder} numberOfLines={1}>{search.loading ? "Searching…" : `${search.commits.length}${search.done ? "" : "+"} ${search.commits.length === 1 && search.done ? "commit" : "commits"}`}</Text>
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
    <ColumnHeader layout={layout} columns={options.columns} onMenu={actions.columnMenu} />
    {search?.loading && !search.commits.length ? <EmptyState title="Searching…" />
      : search && !search.commits.length ? search.error ? null : <EmptyState title="No Results" message="No commit matches. Free words search messages, authors, SHAs and branch names; author:, path:, before: and other qualifiers narrow it." />
      : file?.loading ? <EmptyState title="Loading File History…" />
      : file && !file.commits.length ? <EmptyState title="No History" message="No commit touched this file." />
      : range?.loading && !range.commits.length ? <EmptyState title="Loading Commits…" />
      : range && !range.commits.length ? range.error ? null : <EmptyState symbol="checkmark.circle" title="Nothing to Push" message="Every commit is on the upstream already." />
      : <LegendList<RowCommit>
        // Density re-keys the list once: rows have fixed heights, so the list never measures (spec §7 item 6).
        key={`${listId ?? ""}:${rowHeight}`}
        data={filter ? filter.commits : commits}
        keyExtractor={item => item.oid}
        estimatedItemSize={rowHeight}
        getFixedItemSize={() => rowHeight}
        extraData={extraData}
        recycleItems
        onEndReached={() => actions.loadMore()}
        onEndReachedThreshold={2}
        initialScrollOffset={memory?.key === listKey ? memory.scrollOffset : undefined}
        onScroll={memory ? event => { memory.key = listKey; memory.scrollOffset = event.nativeEvent.contentOffset.y; } : undefined}
        renderItem={({ item }) => <CommitRow commit={item} layout={layout} path={file?.path} selected={highlighted(item.oid)} refs={shownRefs.get(item.oid)} currentBranch={currentBranch} onSelect={onSelect} onCompare={onCompare} onContextMenu={onContextMenu} />}
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
  return <FileListBody files={source.files} selectedPath={source.selectedPath} heading={`${source.files.length === 1 ? "1 changed file" : `${source.files.length} changed files`}${merge ? " (compared with the first parent)" : ""}`} actions={actions} />;
}

function FileListBody({ files, selectedPath, heading, actions }: { files: CommitFile[]; selectedPath: string | null; heading: string; actions: HistoryActions }) {
  const list = useFileList(files, "fileList");
  return <View style={styles.details}>
    <Text style={styles.filesHeading}>{heading}</Text>
    {files.length ? <Sidebar key={list.rowHeight} style={styles.fill} selectedId={selectedPath} onSelectionChange={event => { if (event.id && !event.id.startsWith("folder:")) actions.selectFile(event.id); }} defaultRowHeight={list.rowHeight}>
      {list.rows.map(row => {
        if (row.type === "folder") return folderItem(row, list.rowHeight);
        const { file } = row.entry;
        const renamed = file.oldPath && file.newPath && file.oldPath !== file.newPath;
        const label = renamed ? `${file.oldPath} → ${file.newPath}` : list.showFolder ? row.id : pathParts(row.id).name;
        return <SidebarItem key={row.id} id={row.id} onContextMenu={event => actions.fileContextMenu(row.id, event.windowPosition)}>
          <Text style={[styles.file, row.indent && styles.fileIndent]} numberOfLines={1}>{label}</Text>
        </SidebarItem>;
      })}
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
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, marginHorizontal: 6, borderRadius: 5 },
  cell: { alignSelf: "stretch", justifyContent: "center", overflow: "hidden" },
  subjectCell: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  flexible: { flex: 1 },
  secondary: { fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  columnHeader: { flexDirection: "row", alignItems: "center", gap: 8, height: 22, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  columnTitle: { fontSize: 11, fontWeight: "500", color: PlatformColor("secondaryLabelColor") },
  graph: {},
  line: { position: "absolute" },
  bend: { position: "absolute" },
  node: { position: "absolute", width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2 },
  overflow: { position: "absolute", fontSize: 11, color: PlatformColor("tertiaryLabelColor") },
  tintedRefs: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 2, maxWidth: "50%", overflow: "hidden" },
  tintedRef: { flexDirection: "row", alignItems: "center", gap: 3 },
  currentWeight: { fontWeight: "600" },
  refsColumn: { maxWidth: "100%", flexShrink: 1 },
  refName: { flexShrink: 1, fontSize: 12 },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingLeft: 16, paddingRight: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  headingText: { flex: 1 },
  headingLabel: { fontSize: 12, fontWeight: "600", color: PlatformColor("labelColor") },
  headingFolder: { fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  showAll: { width: 80, height: 24 },
  rowSelected: { backgroundColor: PlatformColor("selectedContentBackgroundColor") },
  summary: { flexShrink: 1, fontSize: 13, color: PlatformColor("labelColor") },
  sha: { fontSize: 11, fontFamily: "Menlo", color: PlatformColor("secondaryLabelColor") },
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
  fileIndent: { paddingLeft: 24 },
});
