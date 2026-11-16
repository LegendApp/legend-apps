import { LegendList } from "@legendapp/list/react-native";
import { type ReactNode } from "react";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { Pressable, Text, View } from "react-native";
import { diffSidebarContentTopInset } from "../viewer/diffViewerConstants";
import type { ChangeStory } from "./storyContract";
import type { DiffViewerTab } from "./useDiffStory";
import { diffSymbolColors } from "../window/diffSystemColors";

export function StorySidebar({ tab, sections, onSection, color, children }: {
  tab: DiffViewerTab; sections: ChangeStory["sections"];
  onSection: (index: number) => void; color: string; children: ReactNode;
}) {
  return <View className="flex-1">
    <View style={{ position: "absolute", top: diffSidebarContentTopInset, bottom: 0, left: 0, right: 0, overflow: "hidden" }}>{tab === "files" ? children : <LegendList data={sections} extraData={color} keyExtractor={section => section.id} estimatedItemSize={44} recycleItems renderItem={({ item, index }) => <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onSection(index)} className="px-3 py-3"><View className="flex-row gap-1">{item.lookHere ? <SFSymbol color={diffSymbolColors.orange} name="flag.fill" size={11} style={{ marginTop: 3 }} /> : null}<Text className="flex-1" style={{ color, fontSize: 13 }}>{item.title}</Text></View></Pressable>} style={{ flex: 1 }} />}</View>
  </View>;
}
