import { LegendList } from "@legendapp/list/react-native";
import { useState, type ReactNode } from "react";
import { SegmentedControl, Select } from "@legendapp/spark/ui";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { Pressable, Text, View } from "react-native";
import { diffSidebarContentTopInset } from "../viewer/diffViewerConstants";
import type { ChangeStory } from "./storyContract";
import type { DiffViewerTab } from "./useDiffStory";
import { diffSymbolColors } from "../window/diffSystemColors";

const tabOptions = [{ label: "Files", value: "files" }, { label: "Story", value: "story" }, { label: "Workflows", value: "workflows" }];
const segmentedTabsWidth = tabOptions.reduce((width, option) => width + Math.max(64, option.label.length * 7 + 28), 0);

export function StorySidebar({ tab, onTab, sections, onSection, color, children, workflows }: {
  tab: DiffViewerTab; onTab: (tab: DiffViewerTab) => void; sections: ChangeStory["sections"];
  onSection: (index: number) => void; color: string; children: ReactNode; workflows?: ReactNode;
}) {
  const [tabsWidth, setTabsWidth] = useState(0);
  // NSSegmentedControl keeps each segment at least 64pt wide; use a pop-up button when the sidebar is narrower.
  const TabsControl = tabsWidth && tabsWidth < segmentedTabsWidth ? Select : SegmentedControl;
  return <View className="flex-1">
    <View className="absolute left-2 right-2 z-10" style={{ top: 54 }} onLayout={event => setTabsWidth(event.nativeEvent.layout.width)}>
      <TabsControl accessibilityLabel="Sidebar view" options={tabOptions} value={tab} onValueChange={value => onTab(value as DiffViewerTab)} style={{ width: tabsWidth || "100%", height: 28 }} />
    </View>
    <View style={{ position: "absolute", top: diffSidebarContentTopInset, bottom: 0, left: 0, right: 0, overflow: "hidden" }}>{tab === "files" ? children : tab === "workflows" ? workflows : <LegendList data={sections} extraData={color} keyExtractor={section => section.id} estimatedItemSize={44} recycleItems renderItem={({ item, index }) => <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => onSection(index)} className="px-3 py-3"><View className="flex-row gap-1">{item.lookHere ? <SFSymbol color={diffSymbolColors.orange} name="flag.fill" size={11} style={{ marginTop: 3 }} /> : null}<Text className="flex-1" style={{ color, fontSize: 13 }}>{item.title}</Text></View></Pressable>} style={{ flex: 1 }} />}</View>
  </View>;
}
