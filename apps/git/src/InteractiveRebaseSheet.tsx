import { useState } from "react";
import { PlatformColor, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Select } from "@legendapp/spark/ui";
import type { GitInteractiveRebasePlan, GitTodoAction, GitTodoEntry } from "@legend-apps/git-core";
import { groupMessage, initialTodo, moveRow, setAction, setMessage, todoActions, todoEntries, todoProblem, todoSummary, type TodoState } from "./gitInteractiveRebase";

const stackedOptions = (names: readonly string[]) => [
  { label: `Move ${names.map(name => `“${name}”`).join(", ")} too`, value: "update" },
  { label: "Leave other branches", value: "leave" },
];

/**
 * Rebase Interactively…: the branch's commits oldest first, each with Pick, Reword, Squash, Fixup or Drop, Move Up and Move
 * Down for the selected one, the message of a reword or squash, and whether stacked branches move along. Drawn in the window
 * like the Create Pull Request sheet.
 */
export function InteractiveRebaseSheet({ top, plan, onto, busy, onCancel, onStart }: {
  top: number; plan: GitInteractiveRebasePlan; onto: string; busy: boolean; onCancel: () => void; onStart: (todo: GitTodoEntry[], updateRefs: boolean) => void;
}) {
  const [state, setState] = useState<TodoState>(() => initialTodo(plan));
  const message = groupMessage(state);
  const problem = todoProblem(state);
  const pushed = state.rows.filter(row => row.pushed).length;
  return <View style={[styles.scrim, { top }]}>
    <View style={styles.sheet} accessibilityLabel="Rebase Interactively">
      <Text style={styles.sheetTitle} accessibilityRole="header">{`Rebase “${plan.branch}” Interactively onto “${onto}”`}</Text>
      <Text style={styles.note}>{`Git applies the commits from top to bottom. A squash or fixup joins the commit above it.${pushed ? ` ${pushed === 1 ? "One commit was" : `${pushed} commits were`} already pushed; rewriting ${pushed === 1 ? "it" : "them"} asks first.` : ""}`}</Text>
      <ScrollView style={styles.list} accessibilityLabel="Commits">
        {state.rows.map((row, index) => {
          const selected = index === state.selected;
          return <Pressable key={row.oid} accessibilityRole="button" accessibilityLabel={`${row.subject}, ${row.oid.slice(0, 7)}`} accessibilityState={{ selected }}
            style={[styles.row, selected && styles.selected]} onPress={() => setState(current => ({ ...current, selected: index }))}>
            <Select style={styles.action} accessibilityLabel={`Action for ${row.subject}`} options={todoActions} value={row.action} disabled={busy}
              onValueChange={value => setState(current => setAction(current, index, value as GitTodoAction))} />
            <Text style={[styles.oid, selected && styles.selectedText]}>{row.oid.slice(0, 7)}</Text>
            <Text style={[styles.subject, row.action === "drop" && styles.dropped, selected && styles.selectedText]} numberOfLines={1}>{row.subject}</Text>
            {row.pushed ? <Text style={[styles.pushed, selected && styles.selectedText]}>Pushed</Text> : null}
          </Pressable>;
        })}
      </ScrollView>
      <View style={styles.row}>
        <Button style={styles.button} disabled={busy || state.selected <= 0} onPress={() => setState(current => moveRow(current, current.selected, -1))}>Move Up</Button>
        <Button style={styles.button} disabled={busy || state.selected >= state.rows.length - 1} onPress={() => setState(current => moveRow(current, current.selected, 1))}>Move Down</Button>
        <View style={styles.spacer} />
        {plan.stacked.length ? <Select style={styles.stacked} accessibilityLabel="Stacked branches" options={stackedOptions(plan.stacked)} value={state.updateRefs ? "update" : "leave"} disabled={busy}
          onValueChange={value => setState(current => ({ ...current, updateRefs: value === "update" }))} /> : null}
      </View>
      {message ? <>
        <Text style={styles.label}>{`Message for “${message.subject}”`}</Text>
        <TextInput accessibilityLabel="Message" multiline value={message.message} editable={!busy} onChangeText={text => setState(current => setMessage(current, message.oid, text))} style={styles.field} />
      </> : null}
      <Text style={[styles.note, problem && styles.problem]}>{problem ?? todoSummary(state)}</Text>
      <View style={styles.buttons}>
        <View style={styles.spacer} />
        <Button style={styles.button} disabled={busy} onPress={onCancel}>Cancel</Button>
        <Button style={styles.start} variant="default" disabled={busy || !!problem} onPress={() => onStart(todoEntries(state), state.updateRefs)}>
          {busy ? "Rebasing…" : "Start Rebase"}
        </Button>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, alignItems: "center" },
  sheet: {
    width: 600, padding: 20, gap: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: PlatformColor("windowBackgroundColor"),
    borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: PlatformColor("separatorColor"), shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  sheetTitle: { fontSize: 13, fontWeight: "700", color: PlatformColor("labelColor") },
  note: { fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  problem: { color: PlatformColor("systemRedColor") },
  list: { maxHeight: 240, borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("controlBackgroundColor") },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28, paddingHorizontal: 6 },
  selected: { backgroundColor: PlatformColor("selectedContentBackgroundColor") },
  selectedText: { color: PlatformColor("alternateSelectedControlTextColor") },
  action: { width: 96, height: 24 },
  oid: { fontFamily: "Menlo", fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  subject: { flex: 1, fontSize: 13, color: PlatformColor("labelColor") },
  dropped: { textDecorationLine: "line-through", color: PlatformColor("tertiaryLabelColor") },
  pushed: { fontSize: 11, color: PlatformColor("secondaryLabelColor") },
  label: { fontSize: 13, color: PlatformColor("labelColor") },
  field: { height: 90, padding: 6, fontSize: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor"), color: PlatformColor("labelColor") },
  buttons: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  spacer: { flex: 1 },
  button: { width: 100, height: 24 },
  stacked: { width: 240, height: 24 },
  start: { width: 130, height: 24 },
});
