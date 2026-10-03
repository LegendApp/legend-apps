import { SwitchControl } from "@legend-apps/design-system";
import { useValue } from "@legendapp/state/react";
import { getAICommandAvailability } from "@legendapp/spark/ai";
import { SettingsRow, SettingsSection } from "@legendapp/spark/settings/window";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { diffCustomization, getDiffCustomizationSettingsTextColor } from "./diffCustomizationRuntime";

function Action({ title, label, onPress, disabled = false }: { title: string; label?: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    className={`min-h-8 justify-center rounded-md border border-border-primary bg-surface px-3${disabled ? " opacity-50" : " hover:bg-surface-muted"}`}>
    <Text className="text-sm text-text-primary">{label ?? title}</Text>
  </Pressable>;
}

export function CustomizeDiffSettings() {
  const state = useValue(diffCustomization.state$);
  const [prompt, setPrompt] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [inspectedVersionId, setInspectedVersionId] = useState<string>();
  const [availability, setAvailability] = useState<{ codex: boolean; claude: boolean }>();
  const [availabilityError, setAvailabilityError] = useState<string>();
  const [availabilityRequest, setAvailabilityRequest] = useState(0);
  const active = state.history.versions.find(version => version.id === state.history.activeId);
  const busy = state.status !== "idle";
  const stackLocked = busy || Boolean(state.preview) || !state.ready;
  const settingsTextColor = getDiffCustomizationSettingsTextColor(state.ready, state.preview?.id ?? null, state.history.activeId);
  const settingsTextStyle = settingsTextColor ? { color: settingsTextColor } : undefined;

  useEffect(() => {
    void diffCustomization.initialize();
    let active = true;
    setAvailabilityError(undefined);
    getAICommandAvailability().then(value => { if (active) setAvailability(value); }).catch(error => { if (active) setAvailabilityError(String(error)); });
    return () => { active = false; };
  }, [availabilityRequest]);

  async function generate() {
    await diffCustomization.generate(prompt, editingId);
    if (!diffCustomization.state$.error.peek()) { setPrompt(""); setEditingId(undefined); }
  }

  return <>
    <SettingsSection first title={null}>
      <Text style={settingsTextStyle} className={`mx-4 my-3 text-sm${settingsTextColor ? "" : " text-text-secondary"}`}>Describe a change to Diff’s viewer, start screen, or Customize App text color. Try it with sample data, then keep or revert it.</Text>
      <SettingsRow title="AI tool" description="Uses your installed, signed-in command-line tool." control={
        <View className="flex-row gap-2">{(["codex", "claude"] as const).map(tool => <Action key={tool} title={`${state.history.tool === tool ? "✓ " : ""}${tool === "codex" ? "Codex" : "Claude"}`}
          disabled={busy} onPress={() => diffCustomization.setPreferences({ tool })} />)}</View>
      } />
      {availability && !availability[state.history.tool] ? <View className="mx-4 my-2 flex-row items-center gap-3">
        <Text style={settingsTextStyle} className={`flex-1 text-sm${settingsTextColor ? "" : " text-text-secondary"}`}>Install {state.history.tool === "codex" ? "Codex" : "Claude"} and sign in to generate changes.</Text>
        <Action title="Check Again" disabled={busy} onPress={() => setAvailabilityRequest(value => value + 1)} />
      </View> : null}
      {availabilityError ? <Text className="mx-4 my-2 text-sm text-danger">{availabilityError}</Text> : null}
      {editingId ? <View className="mx-4 my-2 flex-row items-center justify-between gap-3">
        <Text style={settingsTextStyle} className={`flex-1 text-sm font-semibold${settingsTextColor ? "" : " text-text-primary"}`}>Editing {active?.changes.find(change => change.id === editingId)?.title}</Text>
        <Action title="Cancel Edit" disabled={busy} onPress={() => { setEditingId(undefined); setPrompt(""); }} />
      </View> : null}
      <TextInput accessibilityLabel="Describe an app change" placeholder="For example, make the sidebar easier to read…" multiline
        editable={!stackLocked} maxLength={20_000} value={prompt} onChangeText={setPrompt}
        className="mx-4 my-3 min-h-24 rounded-lg border border-border-primary bg-surface p-3 text-sm text-text-primary" />
      <View className="flex-row items-center gap-3 px-4 pb-3">
        <Action title={busy ? state.status === "generating" ? "Generating…" : state.status === "applying" ? "Applying…" : "Preparing…" : editingId ? "Revise & Preview" : "Generate & Preview"}
          disabled={stackLocked || !prompt.trim() || !availability?.[state.history.tool]} onPress={() => { void generate(); }} />
        {busy && state.status !== "applying" && state.status !== "loading" ? <Action title="Cancel" onPress={() => diffCustomization.cancel()} /> : null}
        {!state.ready && !busy ? <Action title="Retry Setup" onPress={() => { void diffCustomization.retry(); }} /> : null}
      </View>
      {state.error ? <Text accessibilityRole="alert" className="mx-4 my-3 text-sm text-danger">{state.error}</Text> : null}
      {state.preview ? <View className="mx-4 my-3 gap-3 rounded-lg border border-border-primary bg-surface-muted p-3">
        <Text className="text-sm font-semibold text-text-primary">Preview: {state.preview.title}</Text>
        <Text className="text-sm text-text-secondary">Your saved version stays active until you keep this preview.</Text>
        <View className="flex-row gap-2">
          <Action title="Keep" disabled={busy} onPress={() => { void diffCustomization.keep(); }} />
          <Action title="Revert" disabled={state.status === "applying"} onPress={() => { void diffCustomization.revert(); }} />
        </View>
      </View> : null}
      <SettingsRow title="Automatically keep changes" description="Keep newly generated changes after the preview renders successfully. Saved versions remain available."
        control={<SwitchControl accessibilityLabel="Automatically keep changes" checked={state.history.autoKeep} onChange={autoKeep => diffCustomization.setPreferences({ autoKeep })} />} />
    </SettingsSection>
    <SettingsSection title="Changes">
      <View className="gap-3 p-4">
      {!active?.changes.length ? <Text style={settingsTextStyle} className={`text-sm${settingsTextColor ? "" : " text-text-secondary"}`}>No saved changes yet.</Text> : active.changes.map((change, index) => <View key={change.id} className="mb-3 gap-2 rounded-lg border border-border-primary p-3">
        <Text style={settingsTextStyle} className={`text-sm font-semibold${settingsTextColor ? "" : " text-text-primary"}`}>{index + 1}. {change.title}{change.enabled ? "" : " · Disabled"}</Text>
        <Text style={settingsTextStyle} className={`text-sm${settingsTextColor ? "" : " text-text-secondary"}`}>{change.summary}</Text>
        <Text style={settingsTextStyle} className={`text-xs${settingsTextColor ? "" : " text-text-secondary"}`}>{new Date(change.createdAt).toLocaleString()}</Text>
        <View className="flex-row flex-wrap gap-2">
          <Action title={`Edit ${change.title}`} label="Edit" disabled={stackLocked} onPress={() => { setPrompt(change.prompt); setEditingId(change.id); }} />
          <Action title={`${change.enabled ? "Disable" : "Enable"} ${change.title}`} label={change.enabled ? "Disable" : "Enable"} disabled={stackLocked} onPress={() => { void diffCustomization.change(change.id, "toggle"); }} />
          <Action title={`Delete ${change.title}`} label="Delete" disabled={stackLocked} onPress={() => { void diffCustomization.change(change.id, "delete"); }} />
          <Action title={expandedId === change.id ? "Hide Code Changes" : "Show Code Changes"} onPress={() => setExpandedId(expandedId === change.id ? undefined : change.id)} />
        </View>
        {expandedId === change.id ? <View className="mt-2 gap-2">
          <Text selectable style={settingsTextStyle} className={`text-sm${settingsTextColor ? "" : " text-text-primary"}`}>Prompt: {change.prompt}</Text>
          {change.edits.map((edit, editIndex) => <View key={editIndex} className="gap-1">
            <Text style={settingsTextStyle} className={`text-xs font-semibold${settingsTextColor ? "" : " text-text-secondary"}`}>{edit.path}</Text>
            <Text selectable className="font-mono text-xs text-danger">− {edit.before}</Text>
            <Text selectable style={settingsTextStyle} className={`font-mono text-xs${settingsTextColor ? "" : " text-text-primary"}`}>+ {edit.after}</Text>
          </View>)}
        </View> : null}
      </View>)}
      <Action title="Restore Original App" disabled={busy || (!active && !state.error && !state.preview)} onPress={() => { void diffCustomization.reset(); }} />
      <Text style={settingsTextStyle} className={`mt-2 text-xs${settingsTextColor ? "" : " text-text-secondary"}`}>Restoring the original app preserves your saved versions.</Text>
      </View>
    </SettingsSection>
    {state.history.versions.length ? <SettingsSection title="Saved Versions">
      <View className="gap-3 p-4">
      {[...state.history.versions].reverse().map(version => <View key={version.id} className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1"><Text style={settingsTextStyle} className={`text-sm${settingsTextColor ? "" : " text-text-primary"}`}>{version.title}{version.id === state.history.activeId ? " · Active" : ""}</Text>
          <Text style={settingsTextStyle} className={`text-xs${settingsTextColor ? "" : " text-text-secondary"}`}>{new Date(version.createdAt).toLocaleString()} · {version.changes.filter(change => change.enabled).length} changes</Text></View>
        <Action title={`Inspect ${version.title}`} label={inspectedVersionId === version.id ? "Hide" : "Details"} onPress={() => setInspectedVersionId(inspectedVersionId === version.id ? undefined : version.id)} />
        <Action title={`Try ${version.title}`} label="Try" disabled={stackLocked || version.id === state.history.activeId} onPress={() => { void diffCustomization.restore(version.id); }} />
        </View>
        {inspectedVersionId === version.id ? version.changes.map(change => <View key={change.id} className="gap-1 rounded-lg border border-border-primary p-3">
          <Text className="text-sm font-semibold text-text-primary">{change.title}{change.enabled ? "" : " · Disabled"}</Text>
          <Text selectable style={settingsTextStyle} className={`text-sm${settingsTextColor ? "" : " text-text-secondary"}`}>{change.prompt}</Text>
          <Text style={settingsTextStyle} className={`text-xs${settingsTextColor ? "" : " text-text-secondary"}`}>{change.summary}</Text>
        </View>) : null}
      </View>)}
      <Text style={settingsTextStyle} className={`text-xs${settingsTextColor ? "" : " text-text-secondary"}`}>The 30 most recently kept versions are saved.</Text>
      </View>
    </SettingsSection> : null}
  </>;
}
