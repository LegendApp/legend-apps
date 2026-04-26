import { MusicTestView } from "@legend-desktop/music-test";
import {
  addKitchenSinkMenuListener,
  AppKitSplitView,
  configureKitchenSinkMenus,
} from "@legend-desktop/appkit-split-view";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { packages, testsForPackage } from "./packageTests";

const defaultPackageId = "appkit-split-view";
const defaultTestId = "split-view-liquid-glass";
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

export function App() {
  const [selectedPackageId, setSelectedPackageId] = useState(defaultPackageId);
  const availableTests = useMemo(() => testsForPackage(selectedPackageId), [selectedPackageId]);
  const [selectedTestId, setSelectedTestId] = useState(defaultTestId);

  useEffect(() => {
    if (!availableTests.some((test) => test.id === selectedTestId)) {
      setSelectedTestId(availableTests[0]?.id ?? "");
    }
  }, [availableTests, selectedTestId]);

  useEffect(() => {
    configureKitchenSinkMenus(packages, availableTests);
  }, [availableTests]);

  useEffect(() => {
    const subscription = addKitchenSinkMenuListener((action) => {
      if (action.type === "package") {
        setSelectedPackageId(action.id);
      } else if (action.type === "test") {
        setSelectedPackageId(action.packageId);
        setSelectedTestId(action.id);
      }
    });

    return () => subscription.remove();
  }, []);

  const selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId);
  const selectedTest = availableTests.find((test) => test.id === selectedTestId);
  const title = `${selectedPackage?.title ?? selectedPackageId} / ${selectedTest?.title ?? selectedTestId}`;

  if (selectedPackageId === "appkit-split-view") {
    return (
      <AppKitSplitView
        mainTitle={selectedTestId === "split-view-liquid-glass" ? "Liquid Glass Main Content" : "Main Content"}
        selectedSidebarItemId={selectedTestId === "split-view-liquid-glass" ? "liquid-glass" : "split-view"}
        sidebarItemsJson={splitViewSidebarItemsJson}
        sidebarTitle={selectedTestId === "split-view-liquid-glass" ? "Liquid Glass Sidebar" : "Sidebar"}
        style={styles.root}
        titlebarItemsJson={selectedTestId === "split-view-liquid-glass" ? splitViewTitlebarItemsJson : ""}
        usesLiquidGlass={selectedTestId === "split-view-liquid-glass"}
      />
    );
  }

  return (
    <View style={styles.musicPanel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <MusicTestView style={styles.musicNativeView} />
    </View>
  );
}

export default App;

const styles = StyleSheet.create({
  musicNativeView: {
    height: 56,
    width: 280,
  },
  musicPanel: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  root: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
});
