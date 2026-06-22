import { useNativeMenu, type NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { useEffect, useRef } from "react";
import { diffMenuOwnerId } from "./appConstants";
import { getLaunchDiffFolder, openDiffFolderDialog } from "./diffFiles";
import { diffMenuConfig } from "./diffMenus";
import { openDiffSettingsWindow, openDiffViewerWindow, registerDiffWindows } from "./diffWindows";

registerDiffWindows();

type DiffAppProps = {
  launchArguments?: string[];
};

function reportDiffAppControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[DiffAppController] ${message}`);
}

async function openDiffViewerForSelectedFolder() {
  const folderPath = await openDiffFolderDialog();
  if (folderPath) {
    await openDiffViewerWindow(folderPath);
  }
}

export function App({ launchArguments }: DiffAppProps) {
  const didOpenViewerRef = useRef(false);
  const menuHandlers = useRef<NativeMenuActionHandlers>({
    openFolder: () => {
      openDiffViewerForSelectedFolder().catch(reportDiffAppControllerError);
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
      openDiffViewerWindow(getLaunchDiffFolder(launchArguments)).catch(reportDiffAppControllerError);
    }
  }, [launchArguments]);

  return null;
}

export default App;
