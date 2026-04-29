import { addAppExitListener, isAppExitSupported } from "@legend-desktop/app-exit";
import { AutoUpdater } from "@legend-desktop/auto-updater";
import { showContextMenu } from "@legend-desktop/context-menu";
import { addDocumentScannerListener, scanDocuments } from "@legend-desktop/document-scanner";
import {
  addDirectoryChangeListener,
  isWatchingDirectory,
  setWatchedDirectories,
} from "@legend-desktop/file-system-watcher";
import { openFileDialog, saveFileDialog } from "@legend-desktop/file-dialog";
import { addFileScannerListener, scanFiles } from "@legend-desktop/file-scanner";
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
import { parseMarkdown, parseMarkdownFile, type MarkdownBlock } from "@legend-desktop/markdown-parser";
import { addMediaLibraryScannerListener, scanMediaLibrary } from "@legend-desktop/media-library-scanner";
import { readMediaTags } from "@legend-desktop/media-tags";
import { Sidebar, SidebarItem } from "@legend-desktop/sidebar";
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
import { LegendList, type LegendListRenderItemProps } from "@legendapp/list/react-native";
import { type ReactNode, useEffect, useState } from "react";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";
import { AppRegistry, type GestureResponderEvent, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import shellPackage from "../../../shell/package.json";
import { packages, tests, testsForPackage, type KitchenSinkTestConfig } from "./packageTests";

const windowManagerChildModuleName = "KitchenSinkWindowManagerWindow";
const windowManagerChildIdentifier = "kitchen-sink-window-manager-child";
const reactNativeVersionLabel = `RN ${shellPackage.dependencies["react-native"]} / macOS ${shellPackage.dependencies["react-native-macos"]}`;
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
  return <KitchenSinkLauncher />;
}

export default App;

function KitchenSinkLauncher() {
  const [status, setStatus] = useState("Ready");

  useEffect(() => {
    configureKitchenSinkMenus(packages, tests);
  }, []);

  useEffect(() => {
    const subscription = addKitchenSinkMenuListener((action) => {
      if (action.type === "package") {
        const firstTest = testsForPackage(action.id)[0];
        if (firstTest) {
          void openKitchenSinkTest(firstTest).then((result) => {
            setStatus(result.success ? `Opened ${firstTest.title}` : (result.message ?? "Open failed"));
          });
        }
      } else if (action.type === "test") {
        const test = tests.find((candidate) => candidate.id === action.id && candidate.packageId === action.packageId);
        if (test) {
          void openKitchenSinkTest(test).then((result) => {
            setStatus(result.success ? `Opened ${test.title}` : (result.message ?? "Open failed"));
          });
        }
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.launcherRoot}>
      <ScrollView contentContainerStyle={styles.launcherContent} style={styles.launcher}>
        <View style={styles.launcherHeader}>
          <Text style={styles.launcherTitle}>Package Tests</Text>
          <Text style={styles.bodyText}>{status}</Text>
        </View>
        <View style={styles.packageList}>
          {packages.map((pkg) => (
            <View key={pkg.id} style={styles.packageSection}>
              <Text style={styles.packageTitle}>{pkg.title}</Text>
              {testsForPackage(pkg.id).map((test) => (
                <Pressable
                  key={test.id}
                  onPress={() => {
                    void openKitchenSinkTest(test).then((result) => {
                      setStatus(result.success ? `Opened ${test.title}` : (result.message ?? "Open failed"));
                    });
                  }}
                  style={({ pressed }) => [styles.testRow, pressed && styles.testRowPressed]}
                >
                  <Text style={styles.testTitle}>{test.title}</Text>
                  <Text style={styles.testId}>{test.id}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <View pointerEvents="none" style={styles.versionBadge}>
        <Text style={styles.versionBadgeText}>{reactNativeVersionLabel}</Text>
      </View>
    </View>
  );
}

function testWindowIdentifier(test: KitchenSinkTestConfig) {
  return `kitchen-sink-test-${test.id}`;
}

function testWindowTitle(test: KitchenSinkTestConfig) {
  const pkg = packages.find((candidate) => candidate.id === test.packageId);
  return `${pkg?.title ?? test.packageId} / ${test.title}`;
}

function kitchenSinkTestWindowOptions(test: KitchenSinkTestConfig) {
  const { initialProperties, windowStyle, ...windowOptions } = test.windowOptions ?? {};

  const options = {
    ...windowOptions,
    identifier: testWindowIdentifier(test),
    moduleName: windowManagerChildModuleName,
    title: testWindowTitle(test),
    initialProperties: {
      ...(initialProperties ?? {}),
      packageId: test.packageId,
      testId: test.id,
    },
    windowStyle: {
      height: 640,
      minHeight: 360,
      minWidth: 520,
      width: 900,
      ...(windowStyle ?? {}),
    },
  };

  return options;
}

function openKitchenSinkTest(test: KitchenSinkTestConfig) {
  return openWindow(kitchenSinkTestWindowOptions(test));
}

function renderKitchenSinkTest(selectedPackageId: string, selectedTestId: string) {
  const selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId);
  const selectedTest = tests.find((test) => test.id === selectedTestId && test.packageId === selectedPackageId);
  const title = `${selectedPackage?.title ?? selectedPackageId} / ${selectedTest?.title ?? selectedTestId}`;

  if (!selectedPackage || !selectedTest) {
    return (
      <View style={styles.examplePanel}>
        <Text style={styles.panelTitle}>Missing Test</Text>
        <Text style={styles.bodyText}>Package: {selectedPackageId || "none"}</Text>
        <Text style={styles.bodyText}>Test: {selectedTestId || "none"}</Text>
      </View>
    );
  }

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

  if (selectedPackageId === "file-scanner") {
    return <FileScannerExample />;
  }

  if (selectedPackageId === "document-scanner") {
    return <DocumentScannerExample />;
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

  if (selectedPackageId === "markdown-parser") {
    return <MarkdownParserExample />;
  }

  if (selectedPackageId === "media-tags") {
    return <MediaTagsExample />;
  }

  if (selectedPackageId === "media-library-scanner") {
    return <MediaLibraryScannerExample />;
  }

  if (selectedPackageId === "file-system-watcher") {
    return <FileSystemWatcherExample />;
  }

  if (selectedPackageId === "glass-effect-view") {
    return <GlassEffectViewExample />;
  }

  if (selectedPackageId === "sidebar") {
    return <SidebarExample testId={selectedTestId} />;
  }

  if (selectedPackageId === "sf-symbol") {
    return <SFSymbolExample />;
  }

  return (
    <View style={styles.examplePanel}>
      <Text style={styles.panelTitle}>Unhandled Test</Text>
      <Text style={styles.bodyText}>{title}</Text>
    </View>
  );
}

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

function formatFirstPaths(paths: readonly { fileName?: string; relativePath?: string }[]) {
  if (!paths.length) {
    return "No files in the latest batch.";
  }
  return paths
    .slice(0, 5)
    .map((item) => item.relativePath ?? item.fileName ?? "Unknown")
    .join("\n");
}

function FileScannerExample() {
  const [status, setStatus] = useState("Scan /tmp for text-like files.");
  const [latestBatch, setLatestBatch] = useState("No batch received.");

  useEffect(() => {
    const batch = addFileScannerListener("onFileScanBatch", (event) => {
      setLatestBatch(formatFirstPaths(event.files));
      setStatus(`Batch: ${event.files.length} files from root ${event.rootIndex + 1}/${event.totalRoots}`);
    });
    const progress = addFileScannerListener("onFileScanProgress", (event) => {
      setStatus(`Progress: ${event.completedRoots}/${event.totalRoots} roots complete`);
    });
    const complete = addFileScannerListener("onFileScanComplete", (event) => {
      setStatus(`Complete: ${event.totalFiles} files across ${event.totalRoots} roots`);
    });
    return () => {
      batch.remove();
      progress.remove();
      complete.remove();
    };
  }, []);

  return (
    <ExamplePanel title="File Scanner">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{latestBatch}</Text>
      <ExampleButton
        onPress={() => {
          setStatus("Scanning /tmp...");
          void scanFiles(["/tmp"], {
            allowedExtensions: ["txt", "log", "json"],
            batchSize: 12,
            includeStats: true,
          }).then((result) => {
            setStatus(`Result: ${result.totalFiles} files, ${result.errors?.length ?? 0} errors`);
          });
        }}
      >
        Scan /tmp
      </ExampleButton>
    </ExamplePanel>
  );
}

function DocumentScannerExample() {
  const [status, setStatus] = useState("Choose a folder to scan for markdown documents.");
  const [latestBatch, setLatestBatch] = useState("No batch received.");

  useEffect(() => {
    const batch = addDocumentScannerListener("onDocumentScanBatch", (event) => {
      setLatestBatch(formatFirstPaths(event.documents));
      setStatus(`Batch: ${event.documents.length} documents from root ${event.rootIndex + 1}/${event.totalRoots}`);
    });
    const progress = addDocumentScannerListener("onDocumentScanProgress", (event) => {
      setStatus(`Progress: ${event.completedRoots}/${event.totalRoots} roots complete`);
    });
    const complete = addDocumentScannerListener("onDocumentScanComplete", (event) => {
      setStatus(`Complete: ${event.totalDocuments} documents across ${event.totalRoots} roots`);
    });
    return () => {
      batch.remove();
      progress.remove();
      complete.remove();
    };
  }, []);

  return (
    <ExamplePanel title="Document Scanner">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{latestBatch}</Text>
      <ExampleButton
        onPress={() => {
          void openFileDialog({
            canChooseDirectories: true,
            canChooseFiles: false,
          }).then((paths) => {
            if (!paths?.length) {
              setStatus("Directory selection canceled.");
              return;
            }
            setStatus(`Scanning ${paths[0]}...`);
            void scanDocuments(paths, {
              allowedExtensions: ["md", "mdx"],
              batchSize: 12,
              includeStats: true,
            }).then((result) => {
              setStatus(`Result: ${result.totalDocuments} documents, ${result.errors?.length ?? 0} errors`);
            });
          });
        }}
      >
        Choose Folder
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

function WindowManagerChildWindow({
  detail,
  packageId,
  testId,
  title,
}: {
  detail?: string;
  packageId?: string;
  testId?: string;
  title?: string;
}) {
  if (packageId || testId) {
    return renderKitchenSinkTest(packageId ?? "", testId ?? "");
  }

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

const markdownParserSample = `# Markdown Parser

This paragraph has **strong text**, _emphasis_, and [a link](https://legendapp.com).

- [x] Parse block structure
- [ ] Render spans in React

> Native parsing supplies virtualized block rows. React still owns markdown rendering.

| Block | Renderer |
| --- | --- |
| Native | md4c |
| React | EnrichedMarkdownText |

\`\`\`tsx
<Text>Rendered by React Native</Text>
\`\`\`
`;

type MarkdownViewerBlock = MarkdownBlock & { markdown: string };

const markdownViewerStyle: MarkdownStyle = {
  blockquote: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
    borderWidth: 3,
    color: "#1e3a8a",
    fontSize: 14,
    lineHeight: 21,
  },
  code: {
    backgroundColor: "#e2e8f0",
    color: "#0f172a",
    fontFamily: "Menlo",
    fontSize: 13,
  },
  codeBlock: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 6,
    borderWidth: 1,
    color: "#e2e8f0",
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  h1: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    marginBottom: 4,
  },
  h2: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    marginBottom: 4,
  },
  link: {
    color: "#2563eb",
    underline: true,
  },
  list: {
    color: "#334155",
    fontSize: 14,
    gapWidth: 8,
    lineHeight: 21,
    markerColor: "#475569",
  },
  paragraph: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 21,
  },
  table: {
    borderColor: "#cbd5e1",
    borderRadius: 6,
    borderWidth: 1,
    cellPaddingHorizontal: 8,
    cellPaddingVertical: 6,
    color: "#334155",
    fontSize: 13,
    headerBackgroundColor: "#e2e8f0",
    headerTextColor: "#0f172a",
    rowEvenBackgroundColor: "#ffffff",
    rowOddBackgroundColor: "#f8fafc",
  },
  taskList: {
    borderColor: "#64748b",
    checkedColor: "#2563eb",
    checkedTextColor: "#64748b",
  },
};

function markdownViewerBlocks(blocks: readonly MarkdownBlock[]): MarkdownViewerBlock[] {
  return blocks.filter((block): block is MarkdownViewerBlock => !!block.markdown && block.type !== "document");
}

function formatLoadTime(startMs: number) {
  const durationMs = Date.now() - startMs;
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}

function MarkdownBlockRow({ item }: LegendListRenderItemProps<MarkdownViewerBlock>) {
  return (
    <View style={styles.markdownBlockRow}>
      <EnrichedMarkdownText
        allowTrailingMargin={false}
        containerStyle={styles.markdownRenderedText}
        flavor="github"
        markdown={item.markdown}
        markdownStyle={markdownViewerStyle}
        onLinkPress={(event) => {
          void Linking.openURL(event.url);
        }}
        selectable
      />
    </View>
  );
}

function MarkdownParserExample() {
  const [blocks, setBlocks] = useState<MarkdownViewerBlock[]>([]);
  const [status, setStatus] = useState("Loading sample markdown...");

  useEffect(() => {
    void parseMarkdown(markdownParserSample, { dialect: "github" }).then((parsed) => {
      const viewerBlocks = markdownViewerBlocks(parsed.blocks);
      setBlocks(viewerBlocks);
      setStatus(`Sample loaded: ${viewerBlocks.length} render blocks.`);
    });
  }, []);

  return (
    <View style={styles.markdownViewerPanel}>
      <View style={styles.markdownViewerHeader}>
        <Text style={styles.panelTitle}>Markdown Parser</Text>
        <Text style={styles.bodyText}>{status}</Text>
        <View style={styles.markdownViewerActions}>
          <ExampleButton
            onPress={() => {
              setStatus("Parsing sample markdown...");
              void parseMarkdown(markdownParserSample, { dialect: "github" }).then((parsed) => {
                const viewerBlocks = markdownViewerBlocks(parsed.blocks);
                setBlocks(viewerBlocks);
                setStatus(`Sample loaded: ${viewerBlocks.length} render blocks.`);
              });
            }}
          >
            Load Sample
          </ExampleButton>
          <ExampleButton
            onPress={() => {
              void openFileDialog({
                allowedFileTypes: ["md", "mdown", "markdown"],
                allowsMultipleSelection: false,
              }).then((paths) => {
                const path = paths?.[0];
                if (!path) {
                  setStatus("File selection canceled.");
                  return;
                }
                setStatus(`Parsing ${path}...`);
                const startedAt = Date.now();
                void parseMarkdownFile(path, { dialect: "github" }).then((parsed) => {
                  const viewerBlocks = markdownViewerBlocks(parsed.blocks);
                  setBlocks(viewerBlocks);
                  setStatus(
                    `Loaded ${viewerBlocks.length} render blocks from ${path.split("/").pop() ?? path} in ${formatLoadTime(
                      startedAt,
                    )}.`,
                  );
                });
              });
            }}
          >
            Choose Markdown File
          </ExampleButton>
        </View>
      </View>
      <LegendList
        contentContainerStyle={styles.markdownListContent}
        data={blocks}
        estimatedItemSize={120}
        keyExtractor={(item) => item.id}
        recycleItems
        renderItem={MarkdownBlockRow}
        style={styles.markdownList}
      />
    </View>
  );
}

function MediaTagsExample() {
  const [status, setStatus] = useState("Choose an audio file to read metadata.");
  const [tags, setTags] = useState("No tags read yet.");

  return (
    <ExamplePanel title="Media Tags">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{tags}</Text>
      <ExampleButton
        onPress={() => {
          void openFileDialog({
            allowedFileTypes: ["mp3", "m4a", "aac", "wav", "flac", "aif", "aiff", "caf"],
            allowsMultipleSelection: false,
          }).then((paths) => {
            const path = paths?.[0];
            if (!path) {
              setStatus("File selection canceled.");
              return;
            }
            setStatus(`Reading ${path}...`);
            void readMediaTags(path, {
              cacheDir: "/tmp/legend-desktop-media-tags",
              includeArtwork: true,
            }).then((result) => {
              setStatus(`Read tags for ${path.split("/").pop() ?? path}`);
              setTags(JSON.stringify(result, null, 2));
            });
          });
        }}
      >
        Choose Audio File
      </ExampleButton>
    </ExamplePanel>
  );
}

function MediaLibraryScannerExample() {
  const [status, setStatus] = useState("Choose a folder to scan for media files.");
  const [latestBatch, setLatestBatch] = useState("No batch received.");

  useEffect(() => {
    const batch = addMediaLibraryScannerListener("onMediaScanBatch", (event) => {
      setLatestBatch(formatFirstPaths(event.tracks));
      setStatus(`Batch: ${event.tracks.length} tracks from root ${event.rootIndex + 1}/${event.totalRoots}`);
    });
    const progress = addMediaLibraryScannerListener("onMediaScanProgress", (event) => {
      setStatus(`Progress: ${event.completedRoots}/${event.totalRoots} roots complete`);
    });
    const complete = addMediaLibraryScannerListener("onMediaScanComplete", (event) => {
      setStatus(
        `Complete: ${event.totalTracks} tracks, ${event.playlists?.length ?? 0} playlists, ${event.errors?.length ?? 0} errors`,
      );
    });
    return () => {
      batch.remove();
      progress.remove();
      complete.remove();
    };
  }, []);

  return (
    <ExamplePanel title="Media Library Scanner">
      <Text style={styles.bodyText}>{status}</Text>
      <Text style={styles.resultText}>{latestBatch}</Text>
      <ExampleButton
        onPress={() => {
          void openFileDialog({
            canChooseDirectories: true,
            canChooseFiles: false,
          }).then((paths) => {
            if (!paths?.length) {
              setStatus("Directory selection canceled.");
              return;
            }
            setStatus(`Scanning ${paths[0]}...`);
            void scanMediaLibrary(paths, "/tmp/legend-desktop-media-tags", {
              batchSize: 8,
              includeArtwork: false,
            }).then((result) => {
              setStatus(
                `Result: ${result.totalTracks} tracks, ${result.playlists?.length ?? 0} playlists, ${result.errors?.length ?? 0} errors`,
              );
            });
          });
        }}
      >
        Choose Folder
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

const sidebarDataItems = [
  { id: "library", title: "Library" },
  { id: "playlists", title: "Playlists" },
  { id: "artists", title: "Artists" },
  { id: "downloads", title: "Downloads" },
  { id: "disabled", selectable: false, title: "Disabled Row" },
];

const sidebarReactRows = [
  { detail: "5 albums", id: "albums", title: "Albums" },
  { detail: "23 playlists", id: "mixes", title: "Mixes" },
  { detail: "Updated today", id: "recent", title: "Recently Added" },
];

const sidebarDynamicRows = [
  { detail: "Compact row with fixed content.", height: 34, id: "compact", title: "Compact" },
  { detail: "A medium row demonstrating auto height from React layout.", height: 58, id: "medium", title: "Medium" },
  {
    detail: "A taller row. Resizing the window should keep the row heights tied to the React item layout.",
    height: 86,
    id: "tall",
    title: "Tall",
  },
];

function SidebarExample({ testId }: { testId: string }) {
  const [selectedId, setSelectedId] = useState(
    testId === "sidebar-dynamic-heights" ? "compact" : testId === "sidebar-react-rows" ? "albums" : "library",
  );
  const [status, setStatus] = useState("No sidebar event yet.");

  if (testId === "sidebar-data-items") {
    return (
      <ExamplePanel title="Sidebar Data Items">
        <Text style={styles.bodyText}>Selected: {selectedId}</Text>
        <Text style={styles.bodyText}>{status}</Text>
        <Sidebar
          defaultRowHeight={30}
          items={sidebarDataItems}
          onSidebarLayout={(event) => {
            const { height, width } = event.nativeEvent;
            setStatus(`Layout: ${Math.round(width)}x${Math.round(height)}`);
          }}
          onSidebarSelectionChange={(event) => {
            setSelectedId(event.nativeEvent.id);
            setStatus(`Selected ${event.nativeEvent.id}`);
          }}
          selectedId={selectedId}
          style={styles.sidebarPreview}
        />
      </ExamplePanel>
    );
  }

  if (testId === "sidebar-dynamic-heights") {
    return (
      <ExamplePanel title="Sidebar Dynamic Heights">
        <Text style={styles.bodyText}>Selected: {selectedId}</Text>
        <Text style={styles.bodyText}>{status}</Text>
        <Sidebar
          defaultRowHeight={28}
          onSidebarSelectionChange={(event) => {
            setSelectedId(event.nativeEvent.id);
            setStatus(`Selected ${event.nativeEvent.id}`);
          }}
          selectedId={selectedId}
          style={styles.sidebarPreview}
        >
          {sidebarDynamicRows.map((row) => (
            <SidebarItem itemId={row.id} key={row.id} rowHeight="auto" style={{ height: row.height }}>
              <View style={styles.sidebarDynamicRow}>
                <Text style={styles.sidebarRowTitle}>{row.title}</Text>
                <Text style={styles.sidebarRowDetail}>{row.detail}</Text>
              </View>
            </SidebarItem>
          ))}
        </Sidebar>
      </ExamplePanel>
    );
  }

  return (
    <ExamplePanel title="Sidebar React Rows">
      <Text style={styles.bodyText}>Selected: {selectedId}</Text>
      <Text style={styles.bodyText}>{status}</Text>
      <Sidebar
        defaultRowHeight={44}
        onSidebarSelectionChange={(event) => {
          setSelectedId(event.nativeEvent.id);
          setStatus(`Selected ${event.nativeEvent.id}`);
        }}
        selectedId={selectedId}
        style={styles.sidebarPreview}
      >
        {sidebarReactRows.map((row) => (
          <SidebarItem
            itemId={row.id}
            key={row.id}
            onRightClick={(event) => {
              setStatus(
                `Right clicked ${row.id} at ${Math.round(event.nativeEvent.pageX)}, ${Math.round(event.nativeEvent.pageY)}`,
              );
            }}
            rowHeight={44}
            style={styles.sidebarReactItem}
          >
            <View style={styles.sidebarReactRow}>
              <Text style={styles.sidebarRowTitle}>{row.title}</Text>
              <Text style={styles.sidebarRowDetail}>{row.detail}</Text>
            </View>
          </SidebarItem>
        ))}
      </Sidebar>
    </ExamplePanel>
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
  launcher: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  launcherContent: {
    alignItems: "center",
    padding: 28,
    paddingBottom: 64,
  },
  launcherHeader: {
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  launcherRoot: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  launcherTitle: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700",
  },
  markdownBlockRow: {
    alignSelf: "stretch",
  },
  markdownList: {
    backgroundColor: "#e2e8f0",
    flex: 1,
    width: "100%",
  },
  markdownListContent: {
    alignSelf: "center",
    backgroundColor: "#ffffff",
    gap: 4,
    maxWidth: 820,
    minHeight: "100%",
    paddingHorizontal: 56,
    paddingVertical: 48,
    width: "100%",
  },
  markdownRenderedText: {
    paddingVertical: 2,
  },
  markdownViewerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  markdownViewerHeader: {
    alignItems: "center",
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    gap: 10,
    padding: 16,
  },
  markdownViewerPanel: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  packageList: {
    gap: 16,
    maxWidth: 720,
    width: "100%",
  },
  packageSection: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  packageTitle: {
    backgroundColor: "#e2e8f0",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  root: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  resultText: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 560,
    textAlign: "left",
  },
  sidebarDynamicRow: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sidebarPreview: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    height: 210,
    overflow: "hidden",
    width: 320,
  },
  sidebarReactItem: {
    height: 44,
  },
  sidebarReactRow: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sidebarRowDetail: {
    color: "#64748b",
    fontSize: 12,
  },
  sidebarRowTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
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
  testId: {
    color: "#64748b",
    fontSize: 12,
  },
  testRow: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  testRowPressed: {
    backgroundColor: "#f1f5f9",
  },
  testTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  visualPanel: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    flex: 1,
    justifyContent: "center",
  },
  versionBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderRadius: 6,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    right: 12,
  },
  versionBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
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
