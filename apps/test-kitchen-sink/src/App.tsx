import { MusicTestView } from "@legend-desktop/music-test";
import {
  addKitchenSinkMenuListener,
  AppKitSplitView,
  configureKitchenSinkMenus,
} from "@legend-desktop/appkit-split-view";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { packages, testsForPackage } from "./packageTests";

const defaultPackageId = "appkit-split-view";
const defaultTestId = "split-view-basic";

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

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Test Kitchen Sink</Text>
        <Text style={styles.subtitle}>
          {selectedPackage?.title ?? selectedPackageId} / {selectedTest?.title ?? selectedTestId}
        </Text>
      </View>

      <View style={styles.workspace}>
        <View style={styles.sidebar}>
          <Text style={styles.sectionTitle}>Packages</Text>
          {packages.map((pkg) => (
            <Pressable
              key={pkg.id}
              onPress={() => setSelectedPackageId(pkg.id)}
              style={[styles.navItem, selectedPackageId === pkg.id && styles.navItemActive]}
            >
              <Text style={[styles.navText, selectedPackageId === pkg.id && styles.navTextActive]}>
                {pkg.title}
              </Text>
            </Pressable>
          ))}

          <Text style={styles.sectionTitle}>Tests</Text>
          {availableTests.map((test) => (
            <Pressable
              key={test.id}
              onPress={() => setSelectedTestId(test.id)}
              style={[styles.navItem, selectedTestId === test.id && styles.navItemActive]}
            >
              <Text style={[styles.navText, selectedTestId === test.id && styles.navTextActive]}>
                {test.title}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.content}>
          {selectedPackageId === "appkit-split-view" ? (
            <AppKitSplitView
              mainTitle={selectedTestId === "split-view-liquid-glass" ? "Liquid Glass Main Content" : "Main Content"}
              sidebarTitle={selectedTestId === "split-view-liquid-glass" ? "Liquid Glass Sidebar" : "Sidebar"}
              style={styles.splitView}
              usesLiquidGlass={selectedTestId === "split-view-liquid-glass"}
            />
          ) : (
            <View style={styles.musicPanel}>
              <Text style={styles.panelTitle}>Music Test Native View</Text>
              <MusicTestView style={styles.musicNativeView} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default App;

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minWidth: 0,
  },
  header: {
    borderBottomColor: "#d0d5dd",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  musicNativeView: {
    height: 56,
    width: 280,
  },
  musicPanel: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
  },
  navItem: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  navItemActive: {
    backgroundColor: "#1f2937",
  },
  navText: {
    color: "#344054",
    fontSize: 14,
  },
  navTextActive: {
    color: "#ffffff",
    fontWeight: "700",
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
  sectionTitle: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 16,
    textTransform: "uppercase",
  },
  sidebar: {
    borderRightColor: "#d0d5dd",
    borderRightWidth: StyleSheet.hairlineWidth,
    padding: 12,
    width: 260,
  },
  splitView: {
    flex: 1,
  },
  subtitle: {
    color: "#475467",
    fontSize: 13,
  },
  title: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "700",
  },
  workspace: {
    flex: 1,
    flexDirection: "row",
    minHeight: 0,
  },
});
