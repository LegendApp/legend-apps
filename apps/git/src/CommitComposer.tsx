import { useEffect, useRef, useState } from "react";
import { PlatformColor, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { GitCommitInput } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { commitBlocker, composeMessage, splitMessage, type CommitDraft } from "./commitMessage";

export function CommitComposer({ disabled, stagedCount, conflictCount, merging, unborn, onCommit, headMessage, commitRef }: {
  disabled: boolean; stagedCount: number; conflictCount: number; merging: boolean; unborn: boolean;
  onCommit: (input: GitCommitInput) => Promise<boolean>; headMessage: () => Promise<string | null>;
  commitRef?: { current: (() => void) | null };
}) {
  const [draft, setDraft] = useState<CommitDraft>({ subject: "", body: "" });
  const [amend, setAmend] = useState(false);
  const [signoff, setSignoff] = useState(false);
  const savedDraft = useRef<CommitDraft | null>(null);
  // HEAD's message as loaded for amend; committed verbatim while the fields are unedited.
  const amended = useRef<{ message: string; draft: CommitDraft } | null>(null);
  const blocker = commitBlocker({ subject: draft.subject, amend, merging, stagedCount, conflictCount });

  async function toggleAmend(next: boolean) {
    if (!next) {
      setAmend(false);
      setDraft(savedDraft.current ?? { subject: "", body: "" });
      savedDraft.current = null;
      return;
    }
    const message = await headMessage();
    if (message === null) return;
    savedDraft.current = draft;
    const loaded = splitMessage(message);
    amended.current = { message, draft: loaded };
    setDraft(loaded);
    setAmend(true);
  }

  async function commit() {
    if (disabled || blocker) return;
    const unedited = amend && amended.current?.draft.subject === draft.subject && amended.current.draft.body === draft.body;
    if (await onCommit({ message: unedited ? `${amended.current!.message}\n` : composeMessage(draft), amend, signoff })) {
      setDraft({ subject: "", body: "" });
      setAmend(false);
      savedDraft.current = null;
    }
  }

  useEffect(() => {
    if (!commitRef) return;
    commitRef.current = () => void commit();
    return () => { commitRef.current = null; };
  });
  useEffect(() => { if (unborn && amend) { setAmend(false); savedDraft.current = null; } }, [unborn, amend]);

  return <View style={styles.root}>
    <TextInput accessibilityLabel="Commit summary" placeholder="Summary" value={draft.subject} editable={!disabled}
      onChangeText={subject => setDraft(value => ({ ...value, subject }))} onSubmitEditing={() => void commit()} style={styles.subject} />
    <TextInput accessibilityLabel="Commit description" placeholder="Description" multiline value={draft.body} editable={!disabled}
      onChangeText={body => setDraft(value => ({ ...value, body }))} style={styles.body} />
    <View style={styles.options}>
      <Toggle label="Amend" value={amend} disabled={disabled || unborn} onChange={value => void toggleAmend(value)} />
      <Toggle label="Sign Off" value={signoff} disabled={disabled} onChange={setSignoff} />
    </View>
    <Button style={styles.commit} disabled={disabled || !!blocker} onPress={() => void commit()}>{amend ? "Amend Commit" : "Commit"}</Button>
    {unborn ? <Text style={styles.note}>No commits yet. Amend is available after the first commit.</Text> : null}
    {blocker && (conflictCount || draft.subject.trim()) ? <Text accessibilityRole={conflictCount ? "alert" : undefined} style={[styles.note, conflictCount ? styles.conflict : null]}>{blocker}</Text> : null}
  </View>;
}

function Toggle({ label, value, disabled, onChange }: { label: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.toggle}>
    <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} />
    <Text style={[styles.toggleLabel, disabled && styles.disabled]}>{label}</Text>
  </View>;
}

const field = { fontSize: 13, color: PlatformColor("labelColor"), backgroundColor: PlatformColor("textBackgroundColor"), borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), borderRadius: 5, paddingHorizontal: 6 } as const;
const styles = StyleSheet.create({
  root: { gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  subject: { ...field, height: 24 },
  body: { ...field, height: 72, paddingVertical: 4 },
  options: { flexDirection: "row", alignItems: "center", gap: 16 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  toggleLabel: { fontSize: 13, color: PlatformColor("labelColor") },
  disabled: { color: PlatformColor("disabledControlTextColor") },
  commit: { alignSelf: "flex-end", width: 140, height: 28 },
  note: { fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  conflict: { color: PlatformColor("systemRedColor") },
});
