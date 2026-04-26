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
        sidebarTitle={selectedTestId === "split-view-liquid-glass" ? "Liquid Glass Sidebar" : "Sidebar"}
        style={styles.root}
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
