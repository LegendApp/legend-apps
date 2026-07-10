import "./startupDiagnosticsMarker";

import { AutoUpdater } from "@legend-apps/auto-updater";
import { commandRunner } from "@legend-apps/command-runner";
import { useDocumentAppController, type DocumentAppController } from "@legend-apps/document-app";
import { useRoutedHotkeys } from "@legend-apps/hotkeys";
import { updateMenuItems, type NativeMenuActionHandlers } from "@legend-apps/native-menu";
import { addWindowFocusedListener } from "@legend-apps/window-manager";
import { useEffect, useMemo, useRef } from "react";
import { Linking, LogBox } from "react-native";
import { diffMenuOwnerId, diffViewerWindowIdentifier } from "./appConstants";
import { installDiffAppExitHandler } from "./diffAppExit";
import { logDiffOpenTiming } from "./diffInstrumentation";
import { getDiffSourceFromOpenUrl, getLaunchDiffSource, normalizeDiffOpenSource, openDiffFilePairDialog, openDiffFolderDialog } from "./diffFiles";
import { diffMenuConfig } from "./diffMenus";
import {
  diffApplicationHotkeyScope,
  diffHotkeyDefinitions,
  diffHotkeyRouter,
  getDiffHotkeyMenuPatches,
  useDiffHotkeyBindings,
} from "./diffHotkeys";
import {
  getDiffShowOnlyHunksSetting,
  getDiffRestoreWindowsOnStartupSetting,
  setDiffShowOnlyHunksSetting,
  setDiffViewModeSetting,
} from "./diffSettings";
import { dispatchDiffViewerAction } from "./diffViewerActions";
import { installDiffWindowRestoration, restoreSavedDiffWindows } from "./diffWindowRestoration";
import { openDiffSettingsWindow, openDiffViewerWindow, prefetchDiffViewerWindow, registerDiffWindows } from "./diffWindows";

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

logDiffOpenTiming("app.module.body.start", () => ({}));

LogBox.ignoreLogs([
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Text/TextNativeComponent')",
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Utilities/codegenNativeCommands')",
]);

registerDiffWindows();
const initialUrlStartedAt = nowMs();
const initialUrlPromise = Linking.getInitialURL();
void initialUrlPromise
  .then((url) => {
    logDiffOpenTiming("startup.initialUrl.finish", () => ({
      durationMs: Number((nowMs() - initialUrlStartedAt).toFixed(3)),
      hasUrl: Boolean(url),
    }));
  })
  .catch(() => undefined);
const viewerPrefetchStartedAt = nowMs();
prefetchDiffViewerWindow()
  .then(() => {
    logDiffOpenTiming("startup.viewerPrefetch.finish", () => ({
      durationMs: Number((nowMs() - viewerPrefetchStartedAt).toFixed(3)),
    }));
  })
  .catch(reportDiffAppControllerError);
configureDiffAutoUpdates().catch(reportDiffAppControllerError);
logDiffOpenTiming("app.module.body.finish", () => ({}));

type DiffAppProps = {
  launchArguments?: string[];
};

function reportDiffAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DiffAppController] ${message}`);
}

async function configureDiffAutoUpdates() {
  const startedAt = nowMs();
  logDiffOpenTiming("startup.autoUpdater.configure.start", () => ({}));
  const availabilityStartedAt = nowMs();
  const available = AutoUpdater.isAvailable();
  logDiffOpenTiming("startup.autoUpdater.available.finish", () => ({
    available,
    durationMs: Number((nowMs() - availabilityStartedAt).toFixed(3)),
  }));
  if (available) {
    const automaticChecksStartedAt = nowMs();
    await AutoUpdater.setAutomaticallyChecksForUpdates(true);
    logDiffOpenTiming("startup.autoUpdater.automaticChecks.finish", () => ({
      durationMs: Number((nowMs() - automaticChecksStartedAt).toFixed(3)),
    }));
    const intervalStartedAt = nowMs();
    await AutoUpdater.setUpdateCheckInterval(60 * 60 * 24);
    logDiffOpenTiming("startup.autoUpdater.interval.finish", () => ({
      durationMs: Number((nowMs() - intervalStartedAt).toFixed(3)),
    }));
  }
  logDiffOpenTiming("startup.autoUpdater.configure.finish", () => ({
    durationMs: Number((nowMs() - startedAt).toFixed(3)),
  }));
}

async function openDiffViewerForSelectedFolder(controller: DocumentAppController) {
  const folderPath = await openDiffFolderDialog();

  if (folderPath) {
    await openDiffViewerWindow(normalizeDiffOpenSource(folderPath));
    controller.setDocumentWindowOpen(true);
  }
}

async function openDiffViewerForUrl(controller: DocumentAppController) {
  await openDiffViewerWindow(null, { focusUrlInput: true, freshWindow: true });
  controller.setDocumentWindowOpen(true);
}

async function openDiffViewerForSelectedFiles(controller: DocumentAppController) {
  const source = await openDiffFilePairDialog();

  if (source) {
    await openDiffViewerWindow(source);
    controller.setDocumentWindowOpen(true);
  }
}

async function openDiffStartWindow(controller: DocumentAppController) {
  await openDiffViewerWindow(null, { freshWindow: true });
  controller.setDocumentWindowOpen(true);
}

async function openDiffViewerFromClipboard(controller: DocumentAppController) {
  const result = await commandRunner.runCommand({ command: "pbpaste", timeoutMs: 1000 });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Unable to read the clipboard.");
  }

  const source = normalizeDiffOpenSource(result.stdout);
  if (!source) {
    throw new Error("Clipboard does not contain a folder path, GitHub URL, .diff file, or two file paths.");
  }

  await openDiffViewerWindow(source);
  controller.setDocumentWindowOpen(true);
}

function createDiffMenuHandlers(controller: DocumentAppController): NativeMenuActionHandlers {
  return {
    startWindow: () => {
      openDiffStartWindow(controller).catch(reportDiffAppControllerError);
    },
    openFolder: () => {
      openDiffViewerForSelectedFolder(controller).catch(reportDiffAppControllerError);
    },
    compareFiles: () => {
      openDiffViewerForSelectedFiles(controller).catch(reportDiffAppControllerError);
    },
    openUrl: () => {
      openDiffViewerForUrl(controller).catch(reportDiffAppControllerError);
    },
    openFromClipboard: () => {
      openDiffViewerFromClipboard(controller).catch(reportDiffAppControllerError);
    },
    settings: () => {
      openDiffSettingsWindow().catch(reportDiffAppControllerError);
    },
    checkForUpdates: () => {
      AutoUpdater.checkForUpdates().catch(reportDiffAppControllerError);
    },
    filterFiles: dispatchDiffViewerAction,
    nextHunk: dispatchDiffViewerAction,
    previousHunk: dispatchDiffViewerAction,
    reload: dispatchDiffViewerAction,
    revealInFinder: dispatchDiffViewerAction,
    save: dispatchDiffViewerAction,
    showOnlyHunks: (action) => {
      if (!dispatchDiffViewerAction(action)) {
        setDiffShowOnlyHunksSetting(!getDiffShowOnlyHunksSetting());
      }
    },
    toggleSidebar: dispatchDiffViewerAction,
    viewBlocks: () => {
      setDiffViewModeSetting("blocks");
    },
    viewUnified: () => {
      setDiffViewModeSetting("unified");
    },
  };
}

function DiffApplicationHotkeysController({ controller }: { controller: DocumentAppController }) {
  const bindings = useDiffHotkeyBindings();
  const handlers = useMemo(() => ({
    compareFiles: () => {
      openDiffViewerForSelectedFiles(controller).catch(controller.reportError);
    },
    openFolder: () => {
      openDiffViewerForSelectedFolder(controller).catch(controller.reportError);
    },
    openFromClipboard: () => {
      openDiffViewerFromClipboard(controller).catch(controller.reportError);
    },
    openUrl: () => {
      openDiffViewerForUrl(controller).catch(controller.reportError);
    },
    startWindow: () => {
      openDiffStartWindow(controller).catch(controller.reportError);
    },
  }), [controller]);

  useRoutedHotkeys({
    bindings,
    definitions: diffHotkeyDefinitions,
    handlers,
    router: diffHotkeyRouter,
    scope: diffApplicationHotkeyScope,
  });

  useEffect(() => {
    const subscription = addWindowFocusedListener(({ identifier }) => {
      diffHotkeyRouter.setActiveWindowId(identifier);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    updateMenuItems(diffMenuOwnerId, getDiffHotkeyMenuPatches(bindings));
  }, [bindings]);

  return null;
}

async function openRecentDiffFolder(path: string, controller: DocumentAppController) {
  await openDiffViewerWindow(normalizeDiffOpenSource(path));
  controller.setDocumentWindowOpen(true);
}

async function openInitialDiffViewer(launchArguments: string[] | undefined, controller: DocumentAppController) {
  const startedAt = nowMs();
  logDiffOpenTiming("startup.initialOpen.start", () => ({
    launchArgumentCount: launchArguments?.length ?? 0,
  }));
  let source = getLaunchDiffSource(launchArguments?.slice(1));
  let initialUrl: string | null = null;
  if (!source) {
    initialUrl = await initialUrlPromise;
    source = getDiffSourceFromOpenUrl(initialUrl ?? "");
  }
  logDiffOpenTiming("startup.initialOpen.sourceResolved", () => ({
    durationMs: Number((nowMs() - startedAt).toFixed(3)),
    sourceKind: source?.kind ?? null,
  }));

  let restoredWindowCount = 0;
  if (source) {
    await openDiffViewerWindow(source);
    controller.setDocumentWindowOpen(true);
  } else {
    if (getDiffRestoreWindowsOnStartupSetting()) {
      restoredWindowCount = await restoreSavedDiffWindows();
    }
    if (restoredWindowCount === 0) {
      await openDiffViewerWindow(null);
    }
    controller.setDocumentWindowOpen(true);
  }
  logDiffOpenTiming("startup.initialOpen.finish", () => ({
    durationMs: Number((nowMs() - startedAt).toFixed(3)),
    restoredWindowCount,
  }));
}

export function App({ launchArguments }: DiffAppProps) {
  const handledOpenUrlRef = useRef<{ handledAt: number; url: string } | null>(null);
  const controller = useDocumentAppController({
    createMenuHandlers: createDiffMenuHandlers,
    launchArguments,
    menus: diffMenuConfig,
    onInitialOpen: openInitialDiffViewer,
    onRecentDocumentOpen: openRecentDiffFolder,
    onReopenRequested: openDiffStartWindow,
    ownerId: diffMenuOwnerId,
    reportError: reportDiffAppControllerError,
    windowIdentifier: diffViewerWindowIdentifier,
  });
  const controllerRef = useRef(controller);

  useEffect(() => {
    controllerRef.current = controller;
  }, [controller]);

  useEffect(() => {
    const subscription = installDiffAppExitHandler(reportDiffAppControllerError);
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = installDiffWindowRestoration();
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const openUrl = (url: string | null | undefined) => {
      const now = Date.now();
      const lastHandled = handledOpenUrlRef.current;
      const isImmediateDuplicate = lastHandled !== null && lastHandled.url === url && now - lastHandled.handledAt < 1000;
      if (url && !isImmediateDuplicate) {
        handledOpenUrlRef.current = { handledAt: now, url };
        const source = getDiffSourceFromOpenUrl(url);
        if (source) {
          const currentController = controllerRef.current;
          openDiffViewerWindow(source)
            .then(() => {
              currentController.setDocumentWindowOpen(true);
            })
            .catch(currentController.reportError);
        }
      }
    };

    Linking.getInitialURL()
      .then(openUrl)
      .catch((error: unknown) => {
        controllerRef.current.reportError(error);
      });
    const subscription = Linking.addEventListener("url", (event) => {
      openUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return <DiffApplicationHotkeysController controller={controller} />;
}

export default App;
