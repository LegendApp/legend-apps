import { memo, useCallback, useMemo } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

type MouseDetails = { button?: number; ctrlKey?: boolean; pageX?: number; pageY?: number };
import { LegendList } from "@legendapp/list/react-native";
import type { GitHistoryCommit } from "@legend-apps/diff-parser";
import type { GitRefDecoration } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { Sidebar, SidebarItem } from "@legendapp/spark/ui/sidebar";
import { DiffPane } from "./DiffPane";
import { commitGitHubUrl, relativeDate, shortOid, type HistoryState } from "./gitHistory";

export const historyRowHeight = 44;

export type HistoryActions = {
  select(oid: string): void;
  loadMore(): void;
  selectFile(path: string): void;
  copySha(oid: string): void;
  openOnGitHub(oid: string): void;
  /** Right-click or Control-click on a row, in window coordinates. */
  contextMenu(oid: string, position: { x: number; y: number }): void;
};

const badgeOrder = { branch: 0, remote: 1, tag: 2 } as const;

const CommitRow = memo(function CommitRow({ commit, selected, refs, currentBranch, onSelect, onContextMenu }: {
  commit: GitHistoryCommit; selected: boolean; refs: GitRefDecoration[] | undefined; currentBranch: string | null;
  onSelect: (oid: string) => void; onContextMenu: (oid: string, position: { x: number; y: number }) => void;
}) {
  const badges = refs ? [...refs].sort((a, b) => badgeOrder[a.kind] - badgeOrder[b.kind] || a.name.localeCompare(b.name)) : [];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${commit.summary}, ${shortOid(commit.oid)}`} accessibilityState={{ selected }}
    style={[styles.row, selected && styles.rowSelected]}
    onPress={event => { if (!(event.nativeEvent as MouseDetails).ctrlKey) onSelect(commit.oid); }}
    // Pressability only presses for the primary button, so the context menu comes from the raw touch end.
    onTouchEnd={(event: GestureResponderEvent) => {
      const mouse = event.nativeEvent as MouseDetails;
      if (mouse.button === 2 || mouse.ctrlKey) onContextMenu(commit.oid, { x: mouse.pageX ?? 0, y: mouse.pageY ?? 0 });
    }}>
    <View style={styles.rowLine}>
      {badges.map(badge => <Text key={`${badge.kind}:${badge.name}`} numberOfLines={1}
        style={[styles.badge, styles[badge.kind], badge.kind === "branch" && badge.name === currentBranch && styles.current, selected && styles.badgeSelected]}>
        {badge.name}
      </Text>)}
      <Text style={[styles.summary, selected && styles.textSelected]} numberOfLines={1}>{commit.summary || "(no message)"}</Text>
    </View>
    <View style={styles.rowLine}>
      <Text style={[styles.sha, selected && styles.textSelected]}>{shortOid(commit.oid)}</Text>
      <Text style={[styles.meta, selected && styles.textSelected]} numberOfLines={1}>{commit.authorName}</Text>
      <Text style={[styles.date, selected && styles.textSelected]} numberOfLines={1}>{relativeDate(commit.time)}</Text>
    </View>
  </Pressable>;
});

export function HistoryView({ history, actions }: { history: HistoryState; actions: HistoryActions }) {
  const { commits, refs, selectedOid, details, currentBranch } = history;
  const onSelect = useCallback((oid: string) => actions.select(oid), [actions]);
  const onContextMenu = useCallback((oid: string, position: { x: number; y: number }) => actions.contextMenu(oid, position), [actions]);
  // A new object whenever selection or refs change, so recycled rows redraw their badges.
  const extraData = useMemo(() => ({ selectedOid, refs, currentBranch }), [selectedOid, refs, currentBranch]);

  if (history.head?.unborn) return <View style={styles.empty}><Text style={styles.secondary}>No commits yet. Commit from Changes to start the history.</Text></View>;
  if (!history.head) return <View style={styles.empty}><Text style={history.error ? styles.error : styles.secondary}>{history.error ?? "Loading history…"}</Text></View>;
  const commit = details?.commit;
  const file = details?.files.find(entry => entry.path === details.selectedPath);
  const body = commit ? commit.message.split("\n").slice(1).join("\n").replace(/^\n+/, "") : "";
  const sameCommitter = commit && commit.committer.name === commit.author.name && commit.committer.email === commit.author.email && commit.committer.time === commit.author.time;
  const date = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return <View style={styles.split}>
    <View style={styles.list}>
      {history.error ? <Text accessibilityRole="alert" style={styles.error}>{history.error}</Text> : null}
      <LegendList
        data={commits}
        keyExtractor={item => item.oid}
        estimatedItemSize={historyRowHeight}
        getFixedItemSize={() => historyRowHeight}
        extraData={extraData}
        recycleItems
        onEndReached={() => actions.loadMore()}
        onEndReachedThreshold={2}
        renderItem={({ item }) => <CommitRow commit={item} selected={item.oid === selectedOid} refs={refs.get(item.oid)} currentBranch={currentBranch} onSelect={onSelect} onContextMenu={onContextMenu} />}
        ListFooterComponent={history.done ? null : <Text style={styles.footer}>Loading more…</Text>}
      />
    </View>
    <View style={styles.details}>
      {!details ? <View style={styles.empty}><Text style={styles.secondary}>Select a commit to see its details</Text></View>
        : details.error ? <Text accessibilityRole="alert" style={styles.error}>{details.error}</Text>
        : !commit ? <View style={styles.empty}><Text style={styles.secondary}>Loading commit…</Text></View>
        : <>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Text style={styles.subject} selectable>{commit.message.split("\n")[0]}</Text>
              <Text style={styles.oid} selectable>{commit.oid}</Text>
            </View>
            <Button style={styles.action} onPress={() => actions.copySha(commit.oid)}>Copy SHA</Button>
            {commitGitHubUrl(history, commit.oid) ? <Button style={styles.wideAction} onPress={() => actions.openOnGitHub(commit.oid)}>Open on GitHub</Button> : null}
          </View>
          <ScrollView style={styles.metaScroll} contentContainerStyle={styles.meta2}>
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
          <View style={styles.files}>
            <Text style={styles.filesHeading}>{details.files.length === 1 ? "1 changed file" : `${details.files.length} changed files`}{commit.parents.length > 1 ? " (compared with the first parent)" : ""}</Text>
            {details.files.length ? <Sidebar style={{ height: Math.min(details.files.length * 24 + 4, 120) }} selectedId={details.selectedPath} onSelectionChange={event => { if (event.id) actions.selectFile(event.id); }} defaultRowHeight={24}>
              {details.files.map(entry => <SidebarItem key={entry.path} id={entry.path}>
                <Text style={styles.file} numberOfLines={1}>{entry.file.oldPath && entry.file.newPath && entry.file.oldPath !== entry.file.newPath ? `${entry.file.oldPath} → ${entry.file.newPath}` : entry.path}</Text>
              </SidebarItem>)}
            </Sidebar> : null}
          </View>
          {file ? <DiffPane readOnly disabled patch={{ path: file.path, text: file.text, file: file.file, section: "unstaged", conflicted: false }} onApply={() => {}} /> : null}
        </>}
    </View>
  </View>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue} selectable numberOfLines={1}>{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  list: { width: 420 },
  details: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  secondary: { padding: 12, fontSize: 13, color: PlatformColor("secondaryLabelColor") },
  error: { padding: 12, fontSize: 13, color: PlatformColor("systemRedColor") },
  footer: { padding: 12, fontSize: 12, textAlign: "center", color: PlatformColor("secondaryLabelColor") },
  row: { height: historyRowHeight, justifyContent: "center", gap: 2, paddingHorizontal: 12, marginHorizontal: 6, borderRadius: 5 },
  rowSelected: { backgroundColor: PlatformColor("selectedContentBackgroundColor") },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  summary: { flex: 1, fontSize: 13, color: PlatformColor("labelColor") },
  sha: { fontSize: 11, fontFamily: "Menlo", color: PlatformColor("secondaryLabelColor") },
  meta: { flex: 1, fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  date: { fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  textSelected: { color: PlatformColor("alternateSelectedControlTextColor") },
  badge: { maxWidth: 140, fontSize: 10, fontWeight: "600", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  branch: { color: PlatformColor("systemBlueColor"), borderColor: PlatformColor("systemBlueColor") },
  remote: { color: PlatformColor("systemPurpleColor"), borderColor: PlatformColor("systemPurpleColor") },
  tag: { color: PlatformColor("systemOrangeColor"), borderColor: PlatformColor("systemOrangeColor") },
  current: { color: PlatformColor("alternateSelectedControlTextColor"), backgroundColor: PlatformColor("systemBlueColor") },
  badgeSelected: { color: PlatformColor("alternateSelectedControlTextColor"), borderColor: PlatformColor("alternateSelectedControlTextColor") },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  headerTitle: { flex: 1, gap: 2 },
  subject: { fontSize: 14, fontWeight: "600", color: PlatformColor("labelColor") },
  oid: { fontSize: 11, fontFamily: "Menlo", color: PlatformColor("secondaryLabelColor") },
  action: { width: 96, height: 28 },
  wideAction: { width: 128, height: 28 },
  metaScroll: { maxHeight: 180, flexGrow: 0 },
  meta2: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  field: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldLabel: { width: 72, fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  fieldValue: { flex: 1, fontSize: 12, color: PlatformColor("labelColor") },
  link: { fontSize: 12, fontFamily: "Menlo", color: PlatformColor("linkColor") },
  body: { marginTop: 6, fontSize: 12, color: PlatformColor("labelColor") },
  files: { maxHeight: 160, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  filesHeading: { paddingHorizontal: 16, paddingVertical: 6, fontSize: 12, fontWeight: "600", color: PlatformColor("secondaryLabelColor") },
  file: { flex: 1, paddingHorizontal: 8, fontSize: 12, color: PlatformColor("labelColor") },
});
