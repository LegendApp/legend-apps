import { AutoUpdater } from "@legend-desktop/auto-updater";
import { commandRunner } from "@legend-desktop/command-runner";
import { useDocumentAppController, type DocumentAppController } from "@legend-desktop/document-app";
import type { NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { initializeSyntaxAssetsSync } from "@legend-desktop/syntax-parser";
import { useEffect, useRef } from "react";
import { Linking, LogBox } from "react-native";
import { diffMenuOwnerId, diffViewerWindowIdentifier } from "./appConstants";
import { getDiffSourceFromOpenUrl, getLaunchDiffSource, normalizeDiffOpenSource, openDiffFilePairDialog, openDiffFolderDialog } from "./diffFiles";
import { diffMenuConfig } from "./diffMenus";
import {
  getDiffShowOnlyHunksSetting,
  getDiffRestoreWindowsOnStartupSetting,
  setDiffShowOnlyHunksSetting,
  setDiffViewModeSetting,
} from "./diffSettings";
import { dispatchDiffViewerAction } from "./diffViewerActions";
import { installDiffWindowRestoration, restoreSavedDiffWindows } from "./diffWindowRestoration";
import { openDiffSettingsWindow, openDiffViewerWindow, prefetchDiffViewerWindow, registerDiffWindows } from "./diffWindows";

LogBox.ignoreLogs([
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Text/TextNativeComponent')",
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Utilities/codegenNativeCommands')",
]);

registerDiffWindows();
initializeSyntaxAssetsSync();
const initialUrlPromise = Linking.getInitialURL();
void initialUrlPromise.catch(() => undefined);
prefetchDiffViewerWindow().catch(reportDiffAppControllerError);
configureDiffAutoUpdates().catch(reportDiffAppControllerError);

type DiffAppProps = {
  launchArguments?: string[];
};

function reportDiffAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DiffAppController] ${message}`);
}

async function configureDiffAutoUpdates() {
  if (AutoUpdater.isAvailable()) {
    await AutoUpdater.setAutomaticallyChecksForUpdates(true);
    await AutoUpdater.setUpdateCheckInterval(60 * 60 * 24);
  }
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

async function openRecentDiffFolder(path: string, controller: DocumentAppController) {
  await openDiffViewerWindow(normalizeDiffOpenSource(path));
  controller.setDocumentWindowOpen(true);
}

async function openInitialDiffViewer(launchArguments: string[] | undefined, controller: DocumentAppController) {
  let source = getLaunchDiffSource(launchArguments?.slice(1));
  let initialUrl: string | null = null;
  if (!source) {
    initialUrl = await initialUrlPromise;
    source = getDiffSourceFromOpenUrl(initialUrl ?? "");
  }

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

  return null;
}

export default App;
