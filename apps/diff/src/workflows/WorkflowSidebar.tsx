import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { useDiffWorkflows } from "./useDiffWorkflows";
import { WorkflowAction } from "./WorkflowAction";

export function WorkflowSidebar({ controller, color }: { controller: ReturnType<typeof useDiffWorkflows>; color: string }) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [name, setName] = useState("");
  return <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
    {controller.skills.map(skill => <Pressable key={skill.name} accessibilityRole="checkbox" accessibilityLabel={skill.name} accessibilityState={{ checked: controller.selected.includes(skill.name) }}
      onPress={() => controller.setSelected(current => current.includes(skill.name) ? current.filter(name => name !== skill.name) : [...current, skill.name])}>
      <Text style={{ color, fontSize: 13 }}>{controller.selected.includes(skill.name) ? "☑" : "☐"} {skill.name}</Text>
      <Text style={{ color, opacity: 0.6, fontSize: 11 }}>{skill.output} · {skill.layer === "repo" ? "from this repository" : skill.layer}</Text>
    </Pressable>)}
    {controller.selected.filter(name => !controller.skills.some(skill => skill.name === name)).map(name => <Pressable key={name} accessibilityRole="checkbox" accessibilityLabel={`Remove unavailable ${name}`} accessibilityState={{ checked: true }} onPress={() => controller.setSelected(current => current.filter(value => value !== name))}><Text style={{ color }}>☑ {name} · unavailable</Text></Pressable>)}
    <WorkflowAction color={color} title="Run selected" disabled={!controller.ready || !controller.selected.length} onPress={controller.runSelected} />
    <Pressable accessibilityRole="button" accessibilityLabel="Presets" accessibilityState={{ expanded: presetsOpen }} onPress={() => setPresetsOpen(value => !value)}><Text style={{ color }}>Presets {presetsOpen ? "▴" : "▾"}</Text></Pressable>
    {presetsOpen ? <View accessibilityRole="menu" className="gap-3">
      {controller.presets.map(preset => <View key={preset.name} className="gap-1"><Pressable accessibilityRole="menuitem" accessibilityLabel={`Select preset ${preset.name}`} onPress={() => controller.setSelected(preset.skills)}><Text style={{ color }}>{preset.name}</Text></Pressable><WorkflowAction title={`Delete preset ${preset.name}`} color={color} onPress={() => controller.deletePreset(preset.name)} /></View>)}
      <TextInput accessibilityLabel="Preset name" placeholder="Preset name" placeholderTextColor={color} value={name} onChangeText={setName} style={{ color, borderColor: color, borderWidth: 1, padding: 6 }} />
      <WorkflowAction color={color} title="Save selection as preset" disabled={!name.trim() || !controller.selected.length || !controller.scope} onPress={() => { controller.savePreset(name); setName(""); }} />
    </View> : null}
  </ScrollView>;
}
