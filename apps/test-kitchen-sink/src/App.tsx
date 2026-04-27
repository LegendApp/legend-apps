import { addAppExitListener, isAppExitSupported } from "@legend-desktop/app-exit";
import { MusicTestView } from "@legend-desktop/music-test";
import { AutoUpdater } from "@legend-desktop/auto-updater";
import { showContextMenu } from "@legend-desktop/context-menu";
import {
  addDirectoryChangeListener,
  isWatchingDirectory,
  setWatchedDirectories,
} from "@legend-desktop/file-system-watcher";
import { openFileDialog, saveFileDialog } from "@legend-desktop/file-dialog";
import { GlassEffectView } from "@legend-desktop/glass-effect-view";
import { addGlobalHotkeyListener, registerGlobalHotkey, unregisterGlobalHotkey } from "@legend-desktop/global-hotkey";
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
import { SFSymbol } from "@legend-desktop/sf-symbol";
import {
  addFullscreenChangeListener,
  hideWindowControls,
  isWindowFullScreen,
  showWindowControls,
} from "@legend-desktop/window-controls";
import {
  addMainWindowMovedListener,
  addMainWindowResizedListener,
  addWindowClosedListener,
  addWindowFocusedListener,
  closeWindow,
  getMainWindowFrame,
  openWindow,
  setMainWindowFrame,
  setWindowBlur,
  setWindowTitle,
  showMainWindow,
  WindowStyleMask,
  type WindowFrame,
  type WindowResult,
} from "@legend-desktop/window-manager";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AppRegistry, type GestureResponderEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { packages, testsForPackage } from "./packageTests";

const defaultPackageId = "appkit-split-view";
const defaultTestId = "split-view-liquid-glass";
const windowManagerChildModuleName = "KitchenSinkWindowManagerWindow";
const windowManagerChildIdentifier = "kitchen-sink-window-manager-child";
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

AppRegistry.registerComponent(windowManagerChildModuleName, () => WindowManagerChildWindow);

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

  if (selectedPackageId === "window-controls") {
    return <WindowControlsExample />;
  }

  if (selectedPackageId === "window-manager") {
    return <WindowManagerExample />;
  }

  if (selectedPackageId === "global-hotkey") {
    return <GlobalHotkeyExample />;
  }

  if (selectedPackageId === "file-system-watcher") {
    return <FileSystemWatcherExample />;
  }

  if (selectedPackageId === "glass-effect-view") {
    return <GlassEffectViewExample />;
  }

  if (selectedPackageId === "sf-symbol") {
    return <SFSymbolExample />;
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

function WindowControlsExample() {
  const [status, setStatus] = useState("Fullscreen status unknown.");

  useEffect(() => {
    const subscription = addFullscreenChangeListener((event) => {
      setStatus(`Fullscreen: ${event.isFullscreen ? "Yes" : "No"}`);
    });
    void isWindowFullScreen().then((value) => {
      setStatus(`Fullscreen: ${value ? "Yes" : "No"}`);
    });
    return () => subscription.remove();
  }, []);

  return (
    <ExamplePanel title="Window Controls">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton onPress={hideWindowControls}>Hide Controls</ExampleButton>
      <ExampleButton onPress={showWindowControls}>Show Controls</ExampleButton>
      <ExampleButton
        onPress={() => {
          void isWindowFullScreen().then((value) => setStatus(`Fullscreen: ${value ? "Yes" : "No"}`));
        }}
      >
        Check Fullscreen
      </ExampleButton>
    </ExamplePanel>
  );
}

function formatWindowResult(result: WindowResult) {
  return result.success ? "Success" : (result.message ?? "Failed");
}

function formatFrame(frame: WindowFrame) {
  return `${Math.round(frame.x)}, ${Math.round(frame.y)} ${Math.round(frame.width)}x${Math.round(frame.height)}`;
}

function WindowManagerExample() {
  const [status, setStatus] = useState("Open a child window to test WindowManager.");
  const [lastFrame, setLastFrame] = useState<WindowFrame | null>(null);

  useEffect(() => {
    const closed = addWindowClosedListener((event) => {
      setStatus(`Closed: ${event.identifier}`);
    });
    const focused = addWindowFocusedListener((event) => {
      setStatus(`Focused: ${event.identifier} (${event.moduleName ?? "unknown"})`);
    });
    const moved = addMainWindowMovedListener((frame) => {
      setLastFrame(frame);
    });
    const resized = addMainWindowResizedListener((frame) => {
      setLastFrame(frame);
    });
    void getMainWindowFrame().then(setLastFrame);
    return () => {
      closed.remove();
      focused.remove();
      moved.remove();
      resized.remove();
    };
  }, []);

  return (
    <View style={styles.windowManagerPanel}>
      <Text style={styles.panelTitle}>Window Manager</Text>
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.bodyText}>Main frame: {lastFrame ? formatFrame(lastFrame) : "Unknown"}</Text>
      <ScrollView contentContainerStyle={styles.windowManagerControls} style={styles.windowManagerScroll}>
        <ExampleButton
          onPress={() => {
            void openWindow({
              identifier: windowManagerChildIdentifier,
              moduleName: windowManagerChildModuleName,
              title: "Window Manager Child",
              initialProperties: {
                detail: "Opened from the kitchen sink WindowManager test.",
                title: "Window Manager Child",
              },
              windowStyle: {
                hasToolbar: true,
                height: 300,
                mask: [
                  WindowStyleMask.Titled,
                  WindowStyleMask.Closable,
                  WindowStyleMask.Miniaturizable,
                  WindowStyleMask.Resizable,
                  WindowStyleMask.FullSizeContentView,
                ],
                minHeight: 220,
                minWidth: 320,
                titlebarAppearsTransparent: true,
                titlebarSeparatorStyle: "none",
                titleVisibility: "visible",
                toolbarStyle: "unified",
                width: 460,
              },
            }).then((result) => setStatus(`Open child: ${formatWindowResult(result)}`));
          }}
        >
          Open Child Window
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void openWindow({
              animateFrameChange: true,
              frameAnimationDurationMs: 220,
              identifier: windowManagerChildIdentifier,
              moduleName: windowManagerChildModuleName,
              title: "Window Manager Child Updated",
              initialProperties: {
                detail: `Updated at ${new Date().toLocaleTimeString()}`,
                title: "Updated Child Window",
              },
              windowStyle: {
                height: 360,
                minHeight: 240,
                minWidth: 360,
                width: 540,
              },
            }).then((result) => setStatus(`Update child: ${formatWindowResult(result)}`));
          }}
        >
          Update Existing Window
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void setWindowTitle(windowManagerChildIdentifier, "Renamed from JS").then((result) => {
              setStatus(`Set title: ${formatWindowResult(result)}`);
            });
          }}
        >
          Rename Child
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void setWindowBlur(windowManagerChildIdentifier, 8, 250).then((result) => {
              setStatus(`Blur child: ${formatWindowResult(result)}`);
            });
          }}
        >
          Blur Child
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void setWindowBlur(windowManagerChildIdentifier, 0, 250).then((result) => {
              setStatus(`Clear blur: ${formatWindowResult(result)}`);
            });
          }}
        >
          Clear Blur
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void closeWindow(windowManagerChildIdentifier).then((result) => {
              setStatus(`Close child: ${formatWindowResult(result)}`);
            });
          }}
        >
          Close Child
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void showMainWindow().then((result) => {
              setStatus(`Show main: ${formatWindowResult(result)}`);
            });
          }}
        >
          Show Main Window
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void getMainWindowFrame().then((frame) => {
              setLastFrame(frame);
              setStatus(`Read main frame: ${formatFrame(frame)}`);
            });
          }}
        >
          Read Main Frame
        </ExampleButton>
        <ExampleButton
          onPress={() => {
            void getMainWindowFrame().then((frame) => {
              const nextFrame = {
                ...frame,
                height: Math.max(520, Math.round(frame.height)),
                width: Math.max(760, Math.round(frame.width)),
              };
              return setMainWindowFrame(nextFrame).then((result) => {
                setLastFrame(nextFrame);
                setStatus(`Set main frame: ${formatWindowResult(result)}`);
              });
            });
          }}
        >
          Normalize Main Size
        </ExampleButton>
      </ScrollView>
    </View>
  );
}

function WindowManagerChildWindow({ detail, title }: { detail?: string; title?: string }) {
  return (
    <View style={styles.childWindow}>
      <Text style={styles.panelTitle}>{title ?? "Window Manager Child"}</Text>
      <Text style={styles.bodyText}>{detail ?? "No initial properties supplied."}</Text>
      <Text style={styles.bodyText}>This is a separate React root hosted in an NSWindow.</Text>
    </View>
  );
}

const commandModifier = 1 << 20;
const shiftModifier = 1 << 17;

function GlobalHotkeyExample() {
  const [status, setStatus] = useState("Register Command+Shift+Space to test.");

  useEffect(() => {
    const subscription = addGlobalHotkeyListener(() => {
      setStatus(`Hotkey pressed at ${new Date().toLocaleTimeString()}`);
    });
    return () => {
      subscription.remove();
      void unregisterGlobalHotkey();
    };
  }, []);

  return (
    <ExamplePanel title="Global Hotkey">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton
        onPress={() => {
          void registerGlobalHotkey(49, commandModifier | shiftModifier).then((result) => {
            setStatus(result.success ? "Registered Command+Shift+Space." : (result.message ?? "Registration failed."));
          });
        }}
      >
        Register Hotkey
      </ExampleButton>
      <ExampleButton
        onPress={() => {
          void unregisterGlobalHotkey().then((result) => {
            setStatus(result.success ? "Unregistered hotkey." : (result.message ?? "Unregister failed."));
          });
        }}
      >
        Unregister Hotkey
      </ExampleButton>
    </ExamplePanel>
  );
}

function FileSystemWatcherExample() {
  const directory = "/tmp";
  const [status, setStatus] = useState(`Not watching ${directory}.`);

  useEffect(() => {
    const subscription = addDirectoryChangeListener((event) => {
      setStatus(`${event.type}: ${event.filePath}`);
    });
    return () => {
      subscription.remove();
      setWatchedDirectories([]);
    };
  }, []);

  return (
    <ExamplePanel title="File System Watcher">
      <Text style={styles.bodyText}>{status}</Text>
      <ExampleButton
        onPress={() => {
          setWatchedDirectories([directory]);
          setStatus(`Watching ${directory}.`);
        }}
      >
        Watch /tmp
      </ExampleButton>
      <ExampleButton
        onPress={() => {
          void isWatchingDirectory(directory).then((value) => {
            setStatus(`${directory} watched: ${value ? "Yes" : "No"}`);
          });
        }}
      >
        Check Watch
      </ExampleButton>
    </ExamplePanel>
  );
}

function GlassEffectViewExample() {
  return (
    <View style={styles.visualPanel}>
      <GlassEffectView glassStyle="regular" style={styles.glassPreview}>
        <Text style={styles.panelTitle}>Glass Effect View</Text>
        <Text style={styles.bodyText}>Native visual effect container</Text>
      </GlassEffectView>
    </View>
  );
}

const sfSymbolExamples = [
  { color: "#2563eb", name: "music.note.list", scale: "large", size: 72 },
  { color: "#16a34a", name: "play.circle.fill", scale: "large", size: 64 },
  { color: "#dc2626", name: "heart.fill", scale: "medium", size: 56 },
  { color: "#9333ea", name: "sparkles", scale: "medium", size: 56 },
  { color: "#ea580c", name: "speaker.wave.2.fill", scale: "small", size: 48 },
  { color: "#0f766e", name: "waveform", scale: "small", size: 48 },
] as const;

function SFSymbolExample() {
  return (
    <ExamplePanel title="SF Symbol">
      <View style={styles.symbolGrid}>
        {sfSymbolExamples.map((symbol) => (
          <View key={symbol.name} style={styles.symbolTile}>
            <SFSymbol
              color={symbol.color}
              name={symbol.name}
              scale={symbol.scale}
              size={symbol.size}
            />
            <Text style={styles.bodyText}>{symbol.name}</Text>
          </View>
        ))}
      </View>
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
  childWindow: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
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
  glassPreview: {
    alignItems: "center",
    borderRadius: 10,
    gap: 10,
    height: 180,
    justifyContent: "center",
    overflow: "hidden",
    width: 320,
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
  symbolGrid: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    justifyContent: "center",
    maxWidth: 560,
  },
  symbolTile: {
    alignItems: "center",
    gap: 10,
    minHeight: 112,
    width: 160,
  },
  visualPanel: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    flex: 1,
    justifyContent: "center",
  },
  windowManagerControls: {
    alignItems: "center",
    gap: 12,
    paddingBottom: 24,
  },
  windowManagerPanel: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 12,
    padding: 24,
  },
  windowManagerScroll: {
    maxWidth: 520,
    width: "100%",
  },
});
