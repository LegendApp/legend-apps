import { AutoUpdater } from "@legend-desktop/auto-updater";
import { commandRunner } from "@legend-desktop/command-runner";
import { useDocumentAppController, type DocumentAppController } from "@legend-desktop/document-app";
import type { NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { initializeSyntaxAssetsSync } from "@legend-desktop/syntax-parser";
import { useEffect, useRef } from "react";
import { Linking, LogBox } from "react-native";
import { diffMenuOwnerId, diffViewerWindowIdentifier } from "./appConstants";
import { getDiffSourceFromOpenUrl, getLaunchDiffSource, normalizeDiffOpenSource, openDiffFolderDialog } from "./diffFiles";
import { logDiffMemoryMark, logDiffOpenTiming } from "./diffInstrumentation";
import { diffMenuConfig } from "./diffMenus";
import {
  getDiffShowOnlyHunksSetting,
  setDiffShowOnlyHunksSetting,
  setDiffViewModeSetting,
} from "./diffSettings";
import { warmDiffSyntaxHighlightersForStartup } from "./diffSyntaxWarmup";
import { dispatchDiffViewerAction } from "./diffViewerActions";
import { openDiffSettingsWindow, openDiffViewerWindow, prefetchDiffViewerWindow, registerDiffWindows } from "./diffWindows";

LogBox.ignoreLogs([
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Text/TextNativeComponent')",
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Utilities/codegenNativeCommands')",
]);

registerDiffWindows();
initializeSyntaxAssetsSync();
logDiffOpenTiming("app.module", () => ({
  phase: "evaluated",
}));
logDiffMemoryMark("app.module", () => ({
  phase: "evaluated",
}));
logDiffMemoryMark("viewer.prefetch.start", () => ({}));
prefetchDiffViewerWindow()
  .then(() => {
    logDiffMemoryMark("viewer.prefetch.finish", () => ({}));
  })
  .catch(reportDiffAppControllerError);
configureDiffAutoUpdates().catch(reportDiffAppControllerError);

type DiffAppProps = {
  launchArguments?: string[];
};

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function elapsedMs(start: number) {
  return Number((nowMs() - start).toFixed(1));
}

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
  const dialogStartedAt = nowMs();
  logDiffOpenTiming("menu.dialog.start", () => ({}));
  const folderPath = await openDiffFolderDialog();
  const dialogFinishedAt = nowMs();
  logDiffOpenTiming("menu.dialog.finish", () => ({
    dialogMs: Number((dialogFinishedAt - dialogStartedAt).toFixed(1)),
    folderPath,
  }));

  if (folderPath) {
    const windowStartedAt = nowMs();
    await openDiffViewerWindow(normalizeDiffOpenSource(folderPath));
    controller.setDocumentWindowOpen(true);
    logDiffOpenTiming("menu.window.opened", () => ({
      folderPath,
      windowOpenMs: elapsedMs(windowStartedAt),
    }));
  }
}

async function openDiffViewerForUrl(controller: DocumentAppController) {
  const windowStartedAt = nowMs();
  await openDiffViewerWindow(null, { focusUrlInput: true });
  controller.setDocumentWindowOpen(true);
  logDiffOpenTiming("menu.url.window.opened", () => ({
    windowOpenMs: elapsedMs(windowStartedAt),
  }));
}

async function openDiffStartWindow(controller: DocumentAppController) {
  const windowStartedAt = nowMs();
  await openDiffViewerWindow(null);
  controller.setDocumentWindowOpen(true);
  logDiffOpenTiming("start.window.opened", () => ({
    windowOpenMs: elapsedMs(windowStartedAt),
  }));
}

async function openDiffViewerFromClipboard(controller: DocumentAppController) {
  const clipboardStartedAt = nowMs();
  const result = await commandRunner.runCommand({ command: "pbpaste", timeoutMs: 1000 });
  logDiffOpenTiming("menu.clipboard.read", () => ({
    clipboardMs: elapsedMs(clipboardStartedAt),
    exitCode: result.exitCode,
  }));

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Unable to read the clipboard.");
  }

  const source = normalizeDiffOpenSource(result.stdout);
  if (!source) {
    throw new Error("Clipboard does not contain a local path or GitHub PR or commit URL.");
  }

  const windowStartedAt = nowMs();
  await openDiffViewerWindow(source);
  controller.setDocumentWindowOpen(true);
  logDiffOpenTiming("menu.clipboard.window.opened", () => ({
    source,
    windowOpenMs: elapsedMs(windowStartedAt),
  }));
}

function createDiffMenuHandlers(controller: DocumentAppController): NativeMenuActionHandlers {
  return {
    startWindow: () => {
      logDiffOpenTiming("menu.startWindow", () => ({}));
      openDiffStartWindow(controller)
        .then(() => {
          logDiffOpenTiming("menu.startWindow.finish", () => ({}));
        })
        .catch(reportDiffAppControllerError);
    },
    openFolder: () => {
      logDiffOpenTiming("menu.openFolder", () => ({}));
      openDiffViewerForSelectedFolder(controller)
        .then(() => {
          logDiffOpenTiming("menu.openFolder.finish", () => ({}));
        })
        .catch(reportDiffAppControllerError);
    },
    openUrl: () => {
      logDiffOpenTiming("menu.openUrl", () => ({}));
      openDiffViewerForUrl(controller)
        .then(() => {
          logDiffOpenTiming("menu.openUrl.finish", () => ({}));
        })
        .catch(reportDiffAppControllerError);
    },
    openFromClipboard: () => {
      logDiffOpenTiming("menu.openFromClipboard", () => ({}));
      openDiffViewerFromClipboard(controller)
        .then(() => {
          logDiffOpenTiming("menu.openFromClipboard.finish", () => ({}));
        })
        .catch(reportDiffAppControllerError);
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
    initialUrl = await Linking.getInitialURL();
    source = getDiffSourceFromOpenUrl(initialUrl ?? "");
  }
  const startedAt = nowMs();
  logDiffOpenTiming("launch.open.start", () => ({
    initialUrl,
    source,
    launchArgumentCount: launchArguments?.length ?? 0,
  }));
  await openDiffViewerWindow(source);
  controller.setDocumentWindowOpen(true);
  if (!source) {
    logDiffMemoryMark("startup.syntaxWarmup.start", () => ({}));
    warmDiffSyntaxHighlightersForStartup()
      .then((warmupResults) => {
        logDiffMemoryMark("startup.syntaxWarmup.finish", () => ({
          languages: warmupResults.map((warmupResult) => warmupResult.language),
        }));
      })
      .catch(reportDiffAppControllerError);
  }
  logDiffOpenTiming("launch.open.finish", () => ({
    source,
    windowOpenMs: elapsedMs(startedAt),
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
    const openUrl = (url: string | null | undefined) => {
      const now = Date.now();
      const lastHandled = handledOpenUrlRef.current;
      const isImmediateDuplicate = lastHandled !== null && lastHandled.url === url && now - lastHandled.handledAt < 1000;
      if (url && !isImmediateDuplicate) {
        handledOpenUrlRef.current = { handledAt: now, url };
        const source = getDiffSourceFromOpenUrl(url);
        logDiffOpenTiming("url.open", () => ({
          source,
          url,
        }));
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
