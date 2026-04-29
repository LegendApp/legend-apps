import { AppKitSplitView } from "@legend-desktop/appkit-split-view";
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
const splitViewSidebarItemsJson = JSON.stringify(splitViewSidebarItems);
const splitViewTitlebarItems = [
  {
    id: "back",
    placement: "leading",
    symbolName: "chevron.left",
    title: "Back",
  },
  {
    id: "forward",
    placement: "leading",
    symbolName: "chevron.right",
    title: "Forward",
  },
  {
    id: "view",
    placement: "trailing",
    symbolName: "square.grid.2x2",
    title: "View",
  },
  {
    id: "share",
    placement: "trailing",
    symbolName: "square.and.arrow.up",
    title: "Share",
  },
  {
    id: "tags",
    placement: "trailing",
    symbolName: "tag",
    title: "Tags",
  },
  {
    id: "more",
    placement: "trailing",
    symbolName: "ellipsis",
    title: "More",
  },
  {
    id: "search",
    placement: "trailing",
    symbolName: "magnifyingglass",
    title: "Search",
  },
];
const splitViewTitlebarItemsJson = JSON.stringify(splitViewTitlebarItems);

export function AppKitSplitViewExample({ testId }: { testId: string }) {
  return (
    <AppKitSplitView
      mainTitle={testId === "split-view-liquid-glass" ? "Liquid Glass Main Content" : "Main Content"}
      selectedSidebarItemId={testId === "split-view-liquid-glass" ? "liquid-glass" : "split-view"}
      sidebarItemsJson={splitViewSidebarItemsJson}
      sidebarTitle={testId === "split-view-liquid-glass" ? "Liquid Glass Sidebar" : "Sidebar"}
      style={styles.root}
      titlebarItemsJson={testId === "split-view-liquid-glass" ? splitViewTitlebarItemsJson : ""}
      usesLiquidGlass={testId === "split-view-liquid-glass"}
    />
  );
}
