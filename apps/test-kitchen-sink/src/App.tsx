import {
  addKitchenSinkMenuListener,
  configureKitchenSinkMenus,
} from "@legend-desktop/appkit-split-view";
import { openWindow } from "@legend-desktop/window-manager";
import { useEffect, useState } from "react";
import { AppRegistry, Pressable, ScrollView, Text, View } from "react-native";
import shellPackage from "../../../shell/package.json";
import { AppExitExample } from "./examples/app-exit";
import { AppKitSplitViewExample } from "./examples/appkit-split-view";
import { AudioPlayerExample } from "./examples/audio-player";
import { AutoUpdaterExample } from "./examples/auto-updater";
import { ContextMenuExample } from "./examples/context-menu";
import { DocumentScannerExample } from "./examples/document-scanner";
import { DragDropExample } from "./examples/drag-drop";
import { FileDialogExample } from "./examples/file-dialog";
import { FileScannerExample } from "./examples/file-scanner";
import { FileSystemWatcherExample } from "./examples/file-system-watcher";
import { GlassEffectViewExample } from "./examples/glass-effect-view";
import { GlobalHotkeyExample } from "./examples/global-hotkey";
import { KeyboardManagerExample } from "./examples/keyboard-manager";
import { MarkdownParserExample } from "./examples/markdown-parser";
import { MediaLibraryScannerExample } from "./examples/media-library-scanner";
import { MediaTagsExample } from "./examples/media-tags";
import { NativeMenuExample } from "./examples/native-menu";
import { SFSymbolExample } from "./examples/sf-symbol";
import { SidebarExample } from "./examples/sidebar";
import { styles } from "./examples/shared";
import { TextInputSearchExample } from "./examples/text-input-search";
import { WindowControlsExample } from "./examples/window-controls";
import { WindowManagerExample } from "./examples/window-manager";
import { packages, tests, testsForPackage, type KitchenSinkTestConfig } from "./packageTests";

const windowManagerChildModuleName = "KitchenSinkWindowManagerWindow";
const windowManagerChildIdentifier = "kitchen-sink-window-manager-child";
const reactNativeVersionLabel = `RN ${shellPackage.dependencies["react-native"]} / macOS ${shellPackage.dependencies["react-native-macos"]}`;

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
    return <AppKitSplitViewExample testId={selectedTestId} />;
  }

  if (selectedPackageId === "app-exit") {
    return <AppExitExample />;
  }

  if (selectedPackageId === "auto-updater") {
    return <AutoUpdaterExample />;
  }

  if (selectedPackageId === "audio-player") {
    return <AudioPlayerExample />;
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

  if (selectedPackageId === "drag-drop") {
    return <DragDropExample />;
  }

  if (selectedPackageId === "context-menu") {
    return <ContextMenuExample />;
  }

  if (selectedPackageId === "window-controls") {
    return <WindowControlsExample />;
  }

  if (selectedPackageId === "window-manager") {
    return (
      <WindowManagerExample
        childIdentifier={windowManagerChildIdentifier}
        childModuleName={windowManagerChildModuleName}
      />
    );
  }

  if (selectedPackageId === "global-hotkey") {
    return <GlobalHotkeyExample />;
  }

  if (selectedPackageId === "keyboard-manager") {
    return <KeyboardManagerExample />;
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

  if (selectedPackageId === "text-input-search") {
    return <TextInputSearchExample />;
  }

  return (
    <View style={styles.examplePanel}>
      <Text style={styles.panelTitle}>Unhandled Test</Text>
      <Text style={styles.bodyText}>{title}</Text>
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
