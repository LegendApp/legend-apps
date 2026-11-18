import { useState } from "react";
import { PlatformColor, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, SegmentedControl, Select } from "@legendapp/spark/ui";

export type PullRequestInput = { base: string; title: string; body: string; draft: boolean };

const readiness = [{ label: "Ready for Review", value: "ready" }, { label: "Draft", value: "draft" }] as const;

/**
 * Create Pull Request…: base, title, description and Draft for the current branch, drawn in the window like the
 * comment sheet (the pinned Spark has no window sheets, multi-line prompt or checkbox).
 */
export function CreatePullRequestSheet({ top, branch, bases, base: initialBase, title: initialTitle, busy, onCancel, onSubmit }: {
  top: number; branch: string; bases: readonly string[]; base: string; title: string; busy: boolean; onCancel: () => void; onSubmit: (input: PullRequestInput) => void;
}) {
  const [base, setBase] = useState(initialBase);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  return <View style={[styles.scrim, { top }]}>
    <View style={styles.sheet} accessibilityLabel="Create Pull Request">
      <Text style={styles.sheetTitle} accessibilityRole="header">Create Pull Request</Text>
      <View style={styles.row}>
        <Text style={styles.label} numberOfLines={1}>{`Merge “${branch}” into`}</Text>
        <Select style={styles.base} accessibilityLabel="Base branch" options={bases.map(name => ({ label: name, value: name }))} value={base} disabled={busy} onValueChange={setBase} />
      </View>
      <TextInput accessibilityLabel="Title" placeholder="Title" value={title} editable={!busy} onChangeText={setTitle} style={styles.title} />
      <TextInput accessibilityLabel="Description" placeholder="Description (Markdown)" multiline value={body} editable={!busy} onChangeText={setBody} style={styles.field} />
      <View style={styles.buttons}>
        <SegmentedControl style={styles.draft} accessibilityLabel="Draft" options={readiness} value={draft ? "draft" : "ready"} disabled={busy} onValueChange={value => setDraft(value === "draft")} />
        <View style={styles.spacer} />
        <Button style={styles.button} disabled={busy} onPress={onCancel}>Cancel</Button>
        <Button style={styles.create} variant="default" disabled={busy || !title.trim()} onPress={() => onSubmit({ base, title: title.trim(), body: body.trim(), draft })}>
          {busy ? "Creating…" : "Create Pull Request"}
        </Button>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, alignItems: "center" },
  sheet: {
    width: 520, padding: 20, gap: 10, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: PlatformColor("windowBackgroundColor"),
    borderWidth: StyleSheet.hairlineWidth, borderTopWidth: 0, borderColor: PlatformColor("separatorColor"), shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  sheetTitle: { fontSize: 13, fontWeight: "700", color: PlatformColor("labelColor") },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { flexShrink: 1, fontSize: 13, color: PlatformColor("labelColor") },
  base: { width: 180, height: 24 },
  title: { height: 24, paddingHorizontal: 6, fontSize: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor"), color: PlatformColor("labelColor") },
  field: { height: 130, padding: 6, fontSize: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor"), backgroundColor: PlatformColor("textBackgroundColor"), color: PlatformColor("labelColor") },
  buttons: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  draft: { width: 200, height: 24 },
  spacer: { flex: 1 },
  button: { width: 88, height: 24 },
  create: { width: 150, height: 24 },
});
