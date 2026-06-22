import { useNativeMenu, type NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { useEffect, useRef } from "react";
import { diffMenuOwnerId } from "./appConstants";
import { getLaunchDiffFolder, openDiffFolderDialog } from "./diffFiles";
import { diffMenuConfig } from "./diffMenus";
import { openDiffSettingsWindow, openDiffViewerWindow, registerDiffWindows } from "./diffWindows";

registerDiffWindows();
logDiffOpenTiming("app.module", {
  phase: "evaluated",
});

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

async function openDiffViewerForSelectedFolder() {
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
    logDiffOpenTiming("menu.window.opened", {
      folderPath,
      windowOpenMs: elapsedMs(windowStartedAt),
    });
  }
}

export function App({ launchArguments }: DiffAppProps) {
  const didOpenViewerRef = useRef(false);
  const menuHandlers = useRef<NativeMenuActionHandlers>({
    openFolder: () => {
      logDiffOpenTiming("menu.openFolder", {});
      openDiffViewerForSelectedFolder()
        .then(() => {
          logDiffOpenTiming("menu.openFolder.finish", {});
        })
        .catch(reportDiffAppControllerError);
    },
    settings: () => {
      openDiffSettingsWindow().catch(reportDiffAppControllerError);
    },
  }).current;

  useNativeMenu({
    handlers: menuHandlers,
    menus: diffMenuConfig,
    ownerId: diffMenuOwnerId,
  });

  useEffect(() => {
    if (!didOpenViewerRef.current) {
      didOpenViewerRef.current = true;
      const folderPath = getLaunchDiffFolder(launchArguments);
      const startedAt = nowMs();
      logDiffOpenTiming("launch.open.start", {
        folderPath,
        launchArgumentCount: launchArguments?.length ?? 0,
      });
      openDiffViewerWindow(folderPath)
        .then(() => {
          logDiffOpenTiming("launch.open.finish", {
            folderPath,
            windowOpenMs: elapsedMs(startedAt),
          });
        })
        .catch(reportDiffAppControllerError);
    }
  }, [launchArguments]);

  return null;
}

export default App;
