import { useDocumentAppController, type DocumentAppController } from "@legend-desktop/document-app";
import type { NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { LogBox } from "react-native";
import { diffMenuOwnerId, diffViewerWindowIdentifier } from "./appConstants";
import { getLaunchDiffFolder, openDiffFolderDialog } from "./diffFiles";
import { diffMenuConfig } from "./diffMenus";
import { setDiffViewModeSetting } from "./diffSettings";
import { warmDiffSyntaxHighlighters } from "./diffSyntaxWarmup";
import { dispatchDiffViewerAction } from "./diffViewerActions";
import { openDiffSettingsWindow, openDiffViewerWindow, prefetchDiffViewerWindow, registerDiffWindows } from "./diffWindows";

LogBox.ignoreLogs([
  "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Text/TextNativeComponent')",
]);

registerDiffWindows();
logDiffOpenTiming("app.module", {
  phase: "evaluated",
});
prefetchDiffViewerWindow().catch(reportDiffAppControllerError);
setTimeout(() => {
  warmDiffSyntaxHighlighters().catch(reportDiffAppControllerError);
}, 0);

type DiffAppProps = {
  launchArguments?: string[];
};

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function elapsedMs(start: number) {
  return Number((nowMs() - start).toFixed(1));
}

function logDiffOpenTiming(event: string, payload: Record<string, unknown>) {
  console.info(`${Date.now()} [DiffOpenTiming] ${event} ${JSON.stringify(payload)}`);
}

function reportDiffAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DiffAppController] ${message}`);
}

async function openDiffViewerForSelectedFolder(controller: DocumentAppController) {
  const dialogStartedAt = nowMs();
  logDiffOpenTiming("menu.dialog.start", {});
  const folderPath = await openDiffFolderDialog();
  const dialogFinishedAt = nowMs();
  logDiffOpenTiming("menu.dialog.finish", {
    dialogMs: Number((dialogFinishedAt - dialogStartedAt).toFixed(1)),
    folderPath,
  });

  if (folderPath) {
    const windowStartedAt = nowMs();
    await openDiffViewerWindow(folderPath);
    controller.setDocumentWindowOpen(true);
    logDiffOpenTiming("menu.window.opened", {
      folderPath,
      windowOpenMs: elapsedMs(windowStartedAt),
    });
  }
}

function createDiffMenuHandlers(controller: DocumentAppController): NativeMenuActionHandlers {
  return {
    openFolder: () => {
      logDiffOpenTiming("menu.openFolder", {});
      openDiffViewerForSelectedFolder(controller)
        .then(() => {
          logDiffOpenTiming("menu.openFolder.finish", {});
        })
        .catch(reportDiffAppControllerError);
    },
    settings: () => {
      openDiffSettingsWindow().catch(reportDiffAppControllerError);
    },
    reload: dispatchDiffViewerAction,
    revealInFinder: dispatchDiffViewerAction,
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
  await openDiffViewerWindow(path);
  controller.setDocumentWindowOpen(true);
}

async function openInitialDiffViewer(launchArguments: string[] | undefined, controller: DocumentAppController) {
  const folderPath = getLaunchDiffFolder(launchArguments);
  const startedAt = nowMs();
  logDiffOpenTiming("launch.open.start", {
    folderPath,
    launchArgumentCount: launchArguments?.length ?? 0,
  });
  await openDiffViewerWindow(folderPath);
  controller.setDocumentWindowOpen(true);
  logDiffOpenTiming("launch.open.finish", {
    folderPath,
    windowOpenMs: elapsedMs(startedAt),
  });
}

export function App({ launchArguments }: DiffAppProps) {
  useDocumentAppController({
    createMenuHandlers: createDiffMenuHandlers,
    launchArguments,
    menus: diffMenuConfig,
    onInitialOpen: openInitialDiffViewer,
    onRecentDocumentOpen: openRecentDiffFolder,
    ownerId: diffMenuOwnerId,
    reportError: reportDiffAppControllerError,
    windowIdentifier: diffViewerWindowIdentifier,
  });

  return null;
}

export default App;
