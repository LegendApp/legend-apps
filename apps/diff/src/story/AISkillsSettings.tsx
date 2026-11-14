import { useValue } from "@legendapp/state/react";
import { revealInFileManager } from "@legendapp/spark/files";
import { showWindow } from "@legendapp/spark/windows";
import { SettingsSection } from "@legendapp/spark/settings/window";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { diffActiveMenuWindow$ } from "../diffMenuState";
import { builtInStorySkills, parseStorySkill, serializeStorySkill, type StorySkill } from "./storySkill";
import type { SkillLibrary } from "./skillLibrary";
import { skillEditorContext$, skillPreviewTargets, skillViewerContexts$, useSkillLibrary } from "./skillRuntime";

function Action({ title, label, onPress, disabled = false, selected = false }: { title: string; label?: string; onPress(): void; disabled?: boolean; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} className={`min-h-8 justify-center rounded-md border border-border-primary px-3 ${selected ? "bg-surface-muted" : "bg-surface"}${disabled ? " opacity-50" : ""}`}><Text className="text-sm text-text-primary">{label ?? title}</Text></Pressable>;
}
const skillId = (skill: StorySkill) => skill.path ?? `built-in:${skill.name}`;
const draftOf = (skill: StorySkill) => ({ ...skill, maxDiffTokens: String(skill.maxDiffTokens), timeout: String(skill.timeout) });

function SkillEditor({ skill, library, windowId, onSelect }: { skill: StorySkill; library: SkillLibrary; windowId: string; onSelect(id: string): void }) {
  const [original, setOriginal] = useState(skill);
  const [draft, setDraft] = useState(() => draftOf(skill));
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const builtIn = skill.layer === "built-in";
  const changedOnDisk = original.hash !== skill.hash;
  const update = (key: string, value: string) => setDraft(current => ({ ...current, [key]: value }));
  const markdown = () => serializeStorySkill({ ...draft, maxDiffTokens: Number(draft.maxDiffTokens), timeout: Number(draft.timeout) });
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setMessage(undefined);
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const input = (key: "name" | "maxDiffTokens" | "timeout", label: string) => <View className="gap-1"><Text className="text-sm text-text-secondary">{label}</Text><TextInput accessibilityLabel={label} editable={!builtIn && !busy} value={draft[key]} onChangeText={value => update(key, value)} className="min-h-8 rounded border border-border-primary px-2 text-sm text-text-primary" /></View>;
  const choices = (key: "kind" | "output" | "organization" | "tool", label: string, values: string[]) => <View className="gap-1"><Text className="text-sm text-text-secondary">{label}</Text><View className="flex-row flex-wrap gap-2">{values.map(value => <Action key={value} title={`${label}: ${value}`} selected={draft[key] === value} disabled={builtIn || busy} onPress={() => update(key, value)} />)}</View></View>;
  return <View className="gap-3 p-4">
    <Text className="text-base font-semibold text-text-primary">{skill.name} · {skill.layer}</Text>
    {skill.layer === "repo" ? <Text className="text-sm text-text-secondary">From this repository. Each changed prompt needs approval before running.</Text> : null}
    {builtIn ? <Text className="text-sm text-text-secondary">Bundled prompts are read-only. Duplicate to edit a user copy.</Text> : null}
    {skill.path ? <Text selectable className="text-xs text-text-secondary">{skill.path}</Text> : null}
    {input("name", "Skill name")}
    {choices("kind", "Kind", ["story", "workflow"])}
    {choices("output", "Output", ["story", "check", "comments", "patch"])}
    {choices("organization", "Organization", ["auto", "concepts", "commits"])}
    {choices("tool", "Tool", ["auto", "codex", "claude"])}
    {input("maxDiffTokens", "Maximum diff tokens")}{input("timeout", "Timeout (seconds)")}
    <Text className="text-sm text-text-secondary">Markdown prompt</Text>
    <TextInput accessibilityLabel="Markdown prompt" multiline editable={!builtIn && !busy} textAlignVertical="top" value={draft.body} onChangeText={body => update("body", body)} className="min-h-64 rounded border border-border-primary p-3 font-mono text-sm text-text-primary" style={{ minHeight: 240 }} />
    {changedOnDisk ? <Text className="text-sm text-text-secondary">The file changed on disk. Reload before saving, or keep this draft for preview.</Text> : null}
    <View className="flex-row flex-wrap gap-2">
      {builtIn ? <Action title="Duplicate to edit" disabled={busy} onPress={() => void perform(async () => { onSelect(await library.duplicate(skill)); })} /> : <Action title="Save skill" disabled={busy || changedOnDisk} onPress={() => void perform(async () => {
        const text = markdown();
        await library.save(original, text);
        setOriginal({ ...original, ...parseStorySkill(text) }); setMessage("Saved.");
      })} />}
      {!builtIn ? <Action title="Reload from disk" disabled={busy} onPress={() => void perform(async () => {
        await library.reload();
        const latest = library.state$.entries.peek().find(entry => skillId(entry) === skillId(skill));
        if (!latest) throw new Error("The skill is missing or invalid. Check the load errors.");
        setOriginal(latest); setDraft(draftOf(latest));
      })} /> : null}
      {skill.layer === "user" && builtInStorySkills.some(builtIn => builtIn.name === skill.name) ? <Action title="Restore built-in" disabled={busy || changedOnDisk} onPress={() => void perform(async () => { await library.restore(original); onSelect(`built-in:${skill.name}`); })} /> : null}
      <Action title="Reveal in Finder" disabled={busy} onPress={() => void perform(() => revealInFileManager(skill.path ?? library.userDirectory))} />
      <Action title="Try on current diff" disabled={busy || draft.kind !== "story" || draft.output !== "story" || !skillPreviewTargets.has(windowId)} onPress={() => void perform(async () => {
        const candidate = { ...original, ...parseStorySkill(markdown()) };
        if (!skillPreviewTargets.get(windowId)?.(candidate)) throw new Error("Open a complete diff and finish or cancel its running story before trying this skill.");
        await showWindow(windowId);
        setMessage("Preview opened in Story. Your saved story is unchanged.");
      })} />
    </View>
    <Text className="text-xs text-text-secondary">Timeout is in seconds. Workflow prompts can also be edited here. Try opens a preview in the current viewer without saving the prompt or story.</Text>
    {message ? <Text selectable accessibilityLiveRegion="polite" className="text-sm text-text-primary">{message}</Text> : null}
  </View>;
}

export function AISkillsSettings() {
  const windowId = useValue(diffActiveMenuWindow$);
  const context = useValue(() => skillViewerContexts$[windowId].get());
  const requested = useValue(skillEditorContext$);
  const { library, state, error } = useSkillLibrary(context?.repoRoot);
  const selectedId = requested.windowId === windowId ? requested.skillId : undefined;
  const setSelectedId = (skillId: string) => skillEditorContext$.set({ windowId, skillId });
  const selected = state?.entries.find(entry => skillId(entry) === selectedId)
    ?? state?.active.find(entry => entry.name === (requested.windowId === windowId ? requested.skillName : "change-story")) ?? state?.active[0];
  return <>
    <SettingsSection first title="AI Skills">
      <View className="gap-3 p-4">
        <Text className="text-sm text-text-secondary">Repository skills override user skills, which override built-ins with the same name. Reloads follow file changes.</Text>
        {context?.repoRoot ? <Text selectable className="text-xs text-text-secondary">Repository: {context.repoRoot}</Text> : <Text className="text-xs text-text-secondary">Open a repository diff to see its skills.</Text>}
        {state?.entries.map(entry => <View key={skillId(entry)} className="flex-row items-center gap-2"><Action title={`${entry.name} · ${entry.layer}`} label={entry.name} selected={selected && skillId(entry) === skillId(selected)} onPress={() => setSelectedId(skillId(entry))} /><Text className="rounded bg-surface-muted px-2 py-1 text-xs text-text-secondary">{entry.layer}</Text><Text className="text-xs text-text-secondary">{state.active.some(active => active === entry) ? "Active" : "Overridden"} · {entry.kind} / {entry.output}</Text></View>)}
        {!state?.ready ? <Text className="text-sm text-text-secondary">Loading skills…</Text> : null}
        {[...(error ? [error] : []), ...(state?.errors ?? [])].map((message, index) => <Text key={index} selectable className="text-sm text-danger">{message}</Text>)}
      </View>
    </SettingsSection>
    {selected && library ? <SettingsSection title="Edit prompt"><SkillEditor key={skillId(selected)} skill={selected} library={library} windowId={windowId} onSelect={setSelectedId} /></SettingsSection> : null}
  </>;
}
