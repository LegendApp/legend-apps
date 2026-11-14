import { LegendList } from "@legendapp/list/react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { ChangeStory } from "./storyContract";
import type { DiffViewerTab } from "./useDiffStory";

export function StorySidebar({ tab, onTab, sections, onSection, color, children }: {
  tab: DiffViewerTab; onTab: (tab: DiffViewerTab) => void; sections: ChangeStory["sections"];
  onSection: (index: number) => void; color: string; children: ReactNode;
}) {
  return <View className="flex-1">
    <View accessibilityRole="tablist" className="absolute left-2 right-2 z-10 flex-row rounded border" style={{ top: 54, height: 30, borderColor: color }}>
      {(["files", "story"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => onTab(value)} className="flex-1 items-center justify-center" style={{ opacity: tab === value ? 1 : 0.5 }}><Text style={{ color, fontSize: 12, fontWeight: tab === value ? "600" : "400" }}>{value === "files" ? "Files" : "Story"}</Text></Pressable>)}
    </View>
    {tab === "files" ? children : <LegendList data={sections} extraData={color} keyExtractor={section => section.id} contentContainerStyle={{ paddingTop: 96 }} estimatedItemSize={44} recycleItems renderItem={({ item, index }) => <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onSection(index)} className="px-3 py-3"><Text style={{ color, fontSize: 13 }}>{item.lookHere ? "● " : ""}{item.title}</Text></Pressable>} style={{ flex: 1 }} />}
  </View>;
}
