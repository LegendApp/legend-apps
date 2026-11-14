import { useState } from "react";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { useDiffWorkflows } from "./useDiffWorkflows";
import { DiffButton, DiffCheckbox } from "../window/DiffControls";
import { diffSystemColor } from "../window/diffSystemColors";

export function WorkflowSidebar({ controller, color, mutedColor = color }: { controller: ReturnType<typeof useDiffWorkflows>; color: string; mutedColor?: string }) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [name, setName] = useState("");
  return <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
    {controller.skills.map(skill => <DiffCheckbox key={skill.name} label={skill.name} detail={`${skill.output} · ${skill.layer === "repo" ? "from this repository" : skill.layer}`} detailColor={mutedColor} color={color} checked={controller.selected.includes(skill.name)}
      onChange={() => controller.setSelected(current => current.includes(skill.name) ? current.filter(name => name !== skill.name) : [...current, skill.name])} />)}
    {controller.selected.filter(name => !controller.skills.some(skill => skill.name === name)).map(name => <DiffCheckbox key={name} label={`${name} · unavailable`} accessibilityLabel={`Remove unavailable ${name}`} color={color} checked onChange={() => controller.setSelected(current => current.filter(value => value !== name))} />)}
    <DiffButton title="Run selected" disabled={!controller.ready || !controller.selected.length} onPress={controller.runSelected} />
    <Pressable accessibilityRole="button" accessibilityLabel="Presets" accessibilityState={{ expanded: presetsOpen }} onPress={() => setPresetsOpen(value => !value)} className="flex-row items-center gap-1"><SFSymbol color={mutedColor} name={presetsOpen ? "chevron.down" : "chevron.right"} size={11} /><Text style={{ color: mutedColor, fontSize: 11, fontWeight: "600" }}>Presets</Text></Pressable>
    {presetsOpen ? <View accessibilityRole="menu" className="gap-2">
      {controller.presets.map(preset => <View key={preset.name} className="flex-row items-center gap-2"><Pressable accessibilityRole="menuitem" accessibilityLabel={`Select preset ${preset.name}`} onPress={() => controller.setSelected(preset.skills)} className="flex-1"><Text style={{ color, fontSize: 13 }}>{preset.name}</Text></Pressable><DiffButton variant="borderless" title={`Delete preset ${preset.name}`} label="Delete" onPress={() => controller.deletePreset(preset.name)} /></View>)}
      <TextInput accessibilityLabel="Preset name" placeholder="Preset name" placeholderTextColor={mutedColor} value={name} onChangeText={setName} style={{ color, fontSize: 13, borderColor: diffSystemColor("separatorColor"), borderWidth: StyleSheet.hairlineWidth, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }} />
      <DiffButton title="Save selection as preset" label="Save Preset" disabled={!name.trim() || !controller.selected.length || !controller.scope} onPress={() => { controller.savePreset(name); setName(""); }} />
    </View> : null}
  </ScrollView>;
}
