import { useEffect, useRef, useState } from "react";
import { PlatformColor, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { GitCommitInput, GitStagedDiff } from "@legend-apps/git-core";
import { Button } from "@legendapp/spark/ui";
import { commitBlocker, composeMessage, splitMessage, type CommitDraft } from "./commitMessage";
import { createCommitMessageGenerator, type CommitMessageGeneration } from "./commitMessageAI";

export type CommitMessageGenerator = ReturnType<typeof createCommitMessageGenerator>;

export function CommitComposer({ disabled, stagedCount, conflictCount, merging, unborn, root, onCommit, headMessage, commitRef, readStaged, confirmReplace, generatorRef, onGeneratingChange }: {
  disabled: boolean; stagedCount: number; conflictCount: number; merging: boolean; unborn: boolean; root: string;
  onCommit: (input: GitCommitInput) => Promise<boolean>; headMessage: () => Promise<string | null>;
  commitRef?: { current: (() => void) | null };
  readStaged: (signal: AbortSignal) => Promise<{ root: string; staged: GitStagedDiff }>;
  confirmReplace: () => Promise<boolean>;
  generatorRef?: { current: CommitMessageGenerator | null };
  onGeneratingChange?: (generating: boolean) => void;
}) {
  const [draft, setDraft] = useState<CommitDraft>({ subject: "", body: "" });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [generation, setGeneration] = useState<CommitMessageGeneration>({ generating: false, error: null });
  const dependencies = useRef({ readStaged, confirmReplace, onGeneratingChange });
  dependencies.current = { readStaged, confirmReplace, onGeneratingChange };
  const [generator] = useState(() => createCommitMessageGenerator(state => { setGeneration(state); dependencies.current.onGeneratingChange?.(state.generating); }, {
    readStaged: signal => dependencies.current.readStaged(signal),
    confirmReplace: () => dependencies.current.confirmReplace(),
    getDraft: () => draftRef.current,
    setDraft,
  }));
  const canGenerate = !disabled && stagedCount > 0 && !conflictCount;
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
      generator.reset();
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
  useEffect(() => () => generator.reset(), [root, generator]);
  useEffect(() => {
    if (!generatorRef) return;
    generatorRef.current = generator;
    return () => { generatorRef.current = null; };
  }, [generatorRef, generator]);

  return <View style={styles.root}>
    <TextInput accessibilityLabel="Commit summary" placeholder="Summary" value={draft.subject} editable={!disabled}
      onChangeText={subject => setDraft(value => ({ ...value, subject }))} onSubmitEditing={() => void commit()} style={styles.subject} />
    <TextInput accessibilityLabel="Commit description" placeholder="Description" multiline value={draft.body} editable={!disabled}
      onChangeText={body => setDraft(value => ({ ...value, body }))} style={styles.body} />
    <View style={styles.options}>
      <Toggle label="Amend" value={amend} disabled={disabled || unborn} onChange={value => void toggleAmend(value)} />
      <Toggle label="Sign Off" value={signoff} disabled={disabled} onChange={setSignoff} />
    </View>
    <View style={styles.actions}>
      <Button style={styles.generate} disabled={!generation.generating && !canGenerate} onPress={() => generator.toggle()}>{generation.generating ? "Generating…" : "Generate"}</Button>
      {generation.generating ? <Button style={styles.cancel} onPress={() => generator.cancel()}>Cancel</Button> : null}
      <View style={styles.spacer} />
      <Button style={styles.commit} disabled={disabled || !!blocker} onPress={() => void commit()}>{amend ? "Amend Commit" : "Commit"}</Button>
    </View>
    {generation.error ? <Text accessibilityRole="alert" selectable style={[styles.note, styles.conflict]}>{generation.error}</Text> : null}
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
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  spacer: { flex: 1 },
  generate: { width: 96, height: 28 },
  cancel: { width: 72, height: 28 },
  commit: { width: 128, height: 28 },
  note: { fontSize: 12, color: PlatformColor("secondaryLabelColor") },
  conflict: { color: PlatformColor("systemRedColor") },
});
