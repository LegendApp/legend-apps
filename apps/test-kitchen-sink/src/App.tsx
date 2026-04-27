import { addAppExitListener, isAppExitSupported } from "@legend-desktop/app-exit";
import { MusicTestView } from "@legend-desktop/music-test";
import { AutoUpdater } from "@legend-desktop/auto-updater";
import { showContextMenu } from "@legend-desktop/context-menu";
import { openFileDialog, saveFileDialog } from "@legend-desktop/file-dialog";
import {
  addKitchenSinkMenuListener,
  AppKitSplitView,
  configureKitchenSinkMenus,
} from "@legend-desktop/appkit-split-view";
import {
  addNativeMenuActionListener,
  clearMenus,
  configureMenus,
  updateMenuItems,
} from "@legend-desktop/native-menu";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";
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

  if (selectedPackageId === "app-exit") {
    return <AppExitExample />;
  }

  if (selectedPackageId === "auto-updater") {
    return <AutoUpdaterExample />;
  }

  if (selectedPackageId === "native-menu") {
    return <NativeMenuExample />;
  }

  if (selectedPackageId === "file-dialog") {
    return <FileDialogExample />;
  }

  if (selectedPackageId === "context-menu") {
    return <ContextMenuExample />;
  }

  return (
    <View style={styles.musicPanel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <MusicTestView style={styles.musicNativeView} />
    </View>
  );
}

export default App;

function ExamplePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.examplePanel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.exampleControls}>{children}</View>
    </View>
  );
}

function ExampleButton({
  children,
  onPress,
}: {
  children: string;
  onPress: (event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

function AppExitExample() {
  const [lastEvent, setLastEvent] = useState("No exit event received.");

  useEffect(() => {
    const subscription = addAppExitListener((event) => {
      setLastEvent(`Exit event: ${event.reason}`);
    });
    return () => subscription.remove();
  }, []);

  return (
    <ExamplePanel title="App Exit">
      <Text style={styles.bodyText}>Supported: {isAppExitSupported() ? "Yes" : "No"}</Text>
      <Text style={styles.bodyText}>{lastEvent}</Text>
    </ExamplePanel>
  );
}

function AutoUpdaterExample() {
  const [status, setStatus] = useState(`Available: ${AutoUpdater.isAvailable() ? "Yes" : "No"}`);

  return (
    <ExamplePanel title="Auto Updater">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton
        onPress={() => {
          void AutoUpdater.checkForUpdatesInBackground().then((result) => {
            setStatus(`Background check started: ${result ? "Yes" : "No"}`);
          });
        }}
      >
        Check in Background
      </ExampleButton>
    </ExamplePanel>
  );
}

function NativeMenuExample() {
  const [lastAction, setLastAction] = useState("Choose Sample Menu from the native menu bar.");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    configureMenus("kitchen-sink-native-menu", [
      {
        id: "sample",
        title: "Sample",
        placement: { before: "Window" },
        items: [
          { id: "primary", title: "Primary Action", payload: { source: "kitchen-sink" } },
          { separator: true, id: "separator" },
          { id: "toggle", title: "Toggle State", checked },
        ],
      },
    ]);

    const subscription = addNativeMenuActionListener((action) => {
      if (action.ownerId !== "kitchen-sink-native-menu") {
        return;
      }
      setLastAction(`${action.menuId}/${action.itemId}`);
      if (action.itemId === "toggle") {
        setChecked((value) => !value);
      }
    });

    return () => {
      subscription.remove();
      clearMenus("kitchen-sink-native-menu");
    };
  }, []);

  useEffect(() => {
    updateMenuItems("kitchen-sink-native-menu", [
      {
        id: "toggle",
        checked,
        title: checked ? "Toggle State On" : "Toggle State Off",
      },
    ]);
  }, [checked]);

  return (
    <ExamplePanel title="Native Menu">
      <Text style={styles.bodyText}>Last action: {lastAction}</Text>
      <Text style={styles.bodyText}>Toggle checked: {checked ? "Yes" : "No"}</Text>
    </ExamplePanel>
  );
}

function FileDialogExample() {
  const [result, setResult] = useState("No dialog result yet.");

  return (
    <ExamplePanel title="File Dialog">
      <Text style={styles.bodyText}>{result}</Text>
      <ExampleButton
        onPress={() => {
          void openFileDialog({ allowsMultipleSelection: true }).then((paths) => {
            setResult(paths?.length ? paths.join("\n") : "Open canceled.");
          });
        }}
      >
        Open Files
      </ExampleButton>
      <ExampleButton
        onPress={() => {
          void saveFileDialog({ defaultName: "legend-desktop.txt" }).then((path) => {
            setResult(path ?? "Save canceled.");
          });
        }}
      >
        Save File
      </ExampleButton>
    </ExamplePanel>
  );
}

function ContextMenuExample() {
  const [selected, setSelected] = useState("No context menu action yet.");

  return (
    <ExamplePanel title="Context Menu">
      <Text style={styles.bodyText}>{selected}</Text>
      <ExampleButton
        onPress={(event) => {
          const nativeEvent = event.nativeEvent as { pageX?: number; pageY?: number; locationX?: number; locationY?: number };
          void showContextMenu(
            [
              { id: "copy", title: "Copy" },
              { id: "rename", title: "Rename" },
              { enabled: false, id: "disabled", title: "Disabled" },
            ],
            {
              x: nativeEvent.pageX ?? nativeEvent.locationX ?? 0,
              y: nativeEvent.pageY ?? nativeEvent.locationY ?? 0,
            },
          ).then((id) => {
            setSelected(id ? `Selected: ${id}` : "Context menu dismissed.");
          });
        }}
      >
        Show Context Menu
      </ExampleButton>
    </ExamplePanel>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: 6,
    minWidth: 180,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonPressed: {
    backgroundColor: "#374151",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  exampleControls: {
    alignItems: "center",
    gap: 12,
    maxWidth: 520,
  },
  examplePanel: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 18,
    justifyContent: "center",
    padding: 24,
  },
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
