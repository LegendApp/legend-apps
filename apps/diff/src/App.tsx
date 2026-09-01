import { AutoUpdater } from "@legend-apps/auto-updater";
import { commandRunner } from "@legend-apps/command-runner";
import { useDocumentAppController, type DocumentAppController } from "@legend-apps/document-app";
import { useRoutedHotkeys } from "@legend-apps/hotkeys";
import { updateMenuItems, type NativeMenuActionHandlers } from "@legend-apps/native-menu";
import { addWindowFocusedListener, setMainWindowFrame, showMainWindow } from "@legend-apps/window-manager";
import { WindowProvider } from "@legend-apps/windows";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, LogBox } from "react-native";
import { diffMenuOwnerId, diffPrimaryWindowIdentifier } from "./appConstants";
import { installDiffAppExitHandler } from "./diffAppExit";
import { upsertSavedDiffWindow } from "./diffAppMetadata";
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
import { openDiffSettingsWindow, openDiffViewerWindow, registerDiffWindows, type DiffViewerWindowOpenOptions } from "./diffWindows";


LogBox.ignoreLogs([
  "Open debugger to view warnings.",
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Text/TextNativeComponent')",
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Utilities/codegenNativeCommands')",
]);

registerDiffWindows();
const initialUrlPromise = Linking.getInitialURL();
configureDiffAutoUpdates().catch(reportDiffAppControllerError);
const LazyDiffViewerWindowShell = lazy(() =>
  import("./DiffViewerWindowShell").then((module) => ({ default: module.DiffViewerWindowShell })),
);

type DiffAppProps = {
  launchArguments?: string[];
};

type DiffViewerOpener = (
  sourceInput?: Parameters<typeof openDiffViewerWindow>[0],
  options?: DiffViewerWindowOpenOptions,
) => Promise<void>;

type PrimaryDiffViewerOpener = (
  sourceInput?: Parameters<typeof openDiffViewerWindow>[0],
  options?: Pick<DiffViewerWindowOpenOptions, "focusUrlInput" | "frame">,
) => Promise<void>;

type PrimaryDiffWindow = {
  focusUrlInputRequestId?: number;
  instanceId: number;
  source?: NonNullable<ReturnType<typeof normalizeDiffOpenSource>>;
};

function reportDiffAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DiffAppController] ${message}`);
}

async function configureDiffAutoUpdates() {
  const available = AutoUpdater.isAvailable();
  if (available) {
    await AutoUpdater.setAutomaticallyChecksForUpdates(true);
    await AutoUpdater.setUpdateCheckInterval(60 * 60 * 24);
  }
}

async function openDiffViewerForSelectedFolder(controller: DocumentAppController, openViewer: DiffViewerOpener) {
  const folderPath = await openDiffFolderDialog();

  if (folderPath) {
    await openViewer(normalizeDiffOpenSource(folderPath));
    controller.setDocumentWindowOpen(true);
  }
}

async function openDiffViewerForUrl(controller: DocumentAppController, openViewer: DiffViewerOpener) {
  await openViewer(null, { focusUrlInput: true, freshWindow: true });
  controller.setDocumentWindowOpen(true);
}

async function openDiffViewerForSelectedFiles(controller: DocumentAppController, openViewer: DiffViewerOpener) {
  const source = await openDiffFilePairDialog();

  if (source) {
    await openViewer(source);
    controller.setDocumentWindowOpen(true);
  }
}

async function openDiffStartWindow(controller: DocumentAppController, openViewer: DiffViewerOpener) {
  await openViewer(null, { freshWindow: true });
  controller.setDocumentWindowOpen(true);
}

async function openDiffViewerFromClipboard(controller: DocumentAppController, openViewer: DiffViewerOpener) {
  const result = await commandRunner.runCommand({ command: "pbpaste", timeoutMs: 1000 });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Unable to read the clipboard.");
  }

  const source = normalizeDiffOpenSource(result.stdout);
  if (!source) {
    throw new Error("Clipboard does not contain a folder path, GitHub URL, .diff file, or two file paths.");
  }

  await openViewer(source);
  controller.setDocumentWindowOpen(true);
}

function createDiffMenuHandlers(controller: DocumentAppController, openViewer: DiffViewerOpener): NativeMenuActionHandlers {
  return {
    startWindow: () => {
      openDiffStartWindow(controller, openViewer).catch(reportDiffAppControllerError);
    },
    openFolder: () => {
      openDiffViewerForSelectedFolder(controller, openViewer).catch(reportDiffAppControllerError);
    },
    compareFiles: () => {
      openDiffViewerForSelectedFiles(controller, openViewer).catch(reportDiffAppControllerError);
    },
    openUrl: () => {
      openDiffViewerForUrl(controller, openViewer).catch(reportDiffAppControllerError);
    },
    openFromClipboard: () => {
      openDiffViewerFromClipboard(controller, openViewer).catch(reportDiffAppControllerError);
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

function DiffApplicationHotkeysController({
  controller,
  openViewer,
}: {
  controller: DocumentAppController;
  openViewer: DiffViewerOpener;
}) {
  const bindings = useDiffHotkeyBindings();
  const handlers = useMemo(() => ({
    compareFiles: () => {
      openDiffViewerForSelectedFiles(controller, openViewer).catch(controller.reportError);
    },
    openFolder: () => {
      openDiffViewerForSelectedFolder(controller, openViewer).catch(controller.reportError);
    },
    openFromClipboard: () => {
      openDiffViewerFromClipboard(controller, openViewer).catch(controller.reportError);
    },
    openUrl: () => {
      openDiffViewerForUrl(controller, openViewer).catch(controller.reportError);
    },
    startWindow: () => {
      openDiffStartWindow(controller, openViewer).catch(controller.reportError);
    },
  }), [controller, openViewer]);

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

async function openRecentDiffFolder(path: string, controller: DocumentAppController, openViewer: DiffViewerOpener) {
  await openViewer(normalizeDiffOpenSource(path));
  controller.setDocumentWindowOpen(true);
}

async function openInitialDiffViewer(
  launchArguments: string[] | undefined,
  controller: DocumentAppController,
  openPrimaryViewer: PrimaryDiffViewerOpener,
) {
  let source = getLaunchDiffSource(launchArguments?.slice(1));
  if (!source) {
    const initialUrl = await initialUrlPromise;
    source = getDiffSourceFromOpenUrl(initialUrl ?? "");
  }

  let restoredWindowCount = 0;
  if (source) {
    await openPrimaryViewer(source);
    controller.setDocumentWindowOpen(true);
  } else {
    if (getDiffRestoreWindowsOnStartupSetting()) {
      restoredWindowCount = await restoreSavedDiffWindows(({ frame, source: savedSource }) =>
        openPrimaryViewer(savedSource ?? null, { frame }));
    }
    if (restoredWindowCount === 0) {
      await openPrimaryViewer(null);
    }
    controller.setDocumentWindowOpen(true);
  }
}

export function App({ launchArguments }: DiffAppProps) {
  const initialLaunchSource = useMemo(() => getLaunchDiffSource(launchArguments?.slice(1)), [launchArguments]);
  const handledOpenUrlRef = useRef<{ handledAt: number; url: string } | null>(null);
  const nextPrimaryInstanceIdRef = useRef(1);
  const [primaryWindow, setPrimaryWindow] = useState<PrimaryDiffWindow | null>(() => ({
    instanceId: 0,
    ...(initialLaunchSource ? { source: initialLaunchSource } : {}),
  }));
  const primaryWindowRef = useRef(primaryWindow);

  const openPrimaryViewer = useCallback<PrimaryDiffViewerOpener>(async (sourceInput, options = {}) => {
    const source = normalizeDiffOpenSource(sourceInput);
    const current = primaryWindowRef.current;
    const shouldReplaceViewer = current === null || JSON.stringify(current.source) !== JSON.stringify(source);
    const focusUrlInputRequestId = options.focusUrlInput ? nextPrimaryInstanceIdRef.current : undefined;

    if (shouldReplaceViewer || focusUrlInputRequestId !== undefined) {
      const nextWindow: PrimaryDiffWindow = {
        instanceId: nextPrimaryInstanceIdRef.current,
        ...(focusUrlInputRequestId ? { focusUrlInputRequestId } : {}),
        ...(source ? { source } : {}),
      };
      nextPrimaryInstanceIdRef.current += 1;
      primaryWindowRef.current = nextWindow;
      setPrimaryWindow(nextWindow);
    }

    upsertSavedDiffWindow({
      ...(options.frame ? { frame: options.frame } : {}),
      id: diffPrimaryWindowIdentifier,
      ...(source ? { source } : {}),
    });
    if (options.frame) {
      await setMainWindowFrame(options.frame);
    }
    await showMainWindow();
  }, []);

  const openViewer = useCallback<DiffViewerOpener>(async (sourceInput, options = {}) => {
    if (primaryWindowRef.current === null) {
      await openPrimaryViewer(sourceInput, options);
      return;
    }
    await openDiffViewerWindow(sourceInput, options);
  }, [openPrimaryViewer]);

  const createMenuHandlers = useCallback(
    (documentController: DocumentAppController) => createDiffMenuHandlers(documentController, openViewer),
    [openViewer],
  );
  const handleInitialOpen = useCallback(
    (args: string[] | undefined, documentController: DocumentAppController) =>
      openInitialDiffViewer(args, documentController, openPrimaryViewer),
    [openPrimaryViewer],
  );
  const handleRecentDocumentOpen = useCallback(
    (path: string, documentController: DocumentAppController) => openRecentDiffFolder(path, documentController, openViewer),
    [openViewer],
  );
  const handleReopenRequested = useCallback(
    (documentController: DocumentAppController) => openDiffStartWindow(documentController, openViewer),
    [openViewer],
  );
  const controller = useDocumentAppController({
    createMenuHandlers,
    launchArguments,
    menus: diffMenuConfig,
    onInitialOpen: handleInitialOpen,
    onRecentDocumentOpen: handleRecentDocumentOpen,
    onReopenRequested: handleReopenRequested,
    ownerId: diffMenuOwnerId,
    reportError: reportDiffAppControllerError,
    windowIdentifier: diffPrimaryWindowIdentifier,
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
          openViewer(source)
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
  }, [openViewer]);

  const handlePrimaryWindowClose = useCallback(() => {
    primaryWindowRef.current = null;
    setPrimaryWindow(null);
  }, []);

  return (
    <>
      <DiffApplicationHotkeysController controller={controller} openViewer={openViewer} />
      {primaryWindow ? (
        <WindowProvider id={diffPrimaryWindowIdentifier}>
          <Suspense fallback={null}>
            <LazyDiffViewerWindowShell
              key={primaryWindow.instanceId}
              focusUrlInputRequestId={primaryWindow.focusUrlInputRequestId}
              onClose={handlePrimaryWindowClose}
              source={primaryWindow.source}
            />
          </Suspense>
        </WindowProvider>
      ) : null}
    </>
  );
}

export default App;
