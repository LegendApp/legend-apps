import { SidebarSplitView } from "@legend-desktop/appkit-split-view";
import { StyleSheet, Text, View } from "react-native";
import { styles } from "./shared";

const splitViewSidebarItems = [
  {
    id: "overview",
    symbolName: "square.grid.2x2",
    title: "Overview",
  },
  {
    id: "split-view",
    symbolName: "sidebar.left",
    title: "Split View",
  },
  {
    id: "sidebar",
    symbolName: "list.bullet",
    title: "Sidebar",
  },
  {
    id: "liquid-glass",
    symbolName: "sparkles",
    title: "Liquid Glass",
  },
];

export function SidebarSplitViewExample() {
  return (
    <SidebarSplitView contentMinWidth={320} sidebarMinWidth={180} style={styles.root}>
      <View style={splitStyles.sidebar}>
        <Text style={splitStyles.sidebarTitle}>Sidebar</Text>
        <View style={splitStyles.sidebarList}>
          {splitViewSidebarItems.map((item) => (
            <View
              key={item.id}
              style={[
                splitStyles.sidebarRow,
                item.id === "split-view" ? splitStyles.sidebarRowSelected : null,
              ]}
            >
              <Text style={splitStyles.sidebarSymbol}>{item.symbolName}</Text>
              <Text style={splitStyles.sidebarRowTitle}>{item.title}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={splitStyles.content}>
        <Text style={splitStyles.contentTitle}>Main Content</Text>
        <Text style={splitStyles.contentBody}>Both split view panes are rendered from React content.</Text>
      </View>
    </SidebarSplitView>
  );
}

const splitStyles = StyleSheet.create({
  content: {
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 8,
    justifyContent: "center",
    padding: 28,
  },
  contentBody: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
  },
  contentTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "700",
  },
  sidebar: {
    backgroundColor: "#e2e8f0",
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 52,
  },
  sidebarList: {
    gap: 4,
  },
  sidebarRow: {
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    gap: 8,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  sidebarRowSelected: {
    backgroundColor: "#cbd5e1",
  },
  sidebarRowTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "600",
  },
  sidebarSymbol: {
    color: "#64748b",
    fontSize: 11,
    width: 88,
  },
  sidebarTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 14,
  },
});
