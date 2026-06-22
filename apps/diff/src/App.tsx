import { useNativeMenu, type NativeMenuActionHandlers } from "@legend-desktop/native-menu";
import { useEffect, useRef } from "react";
import { diffMenuOwnerId } from "./appConstants";
import { openDiffFolderDialog } from "./diffFiles";
import { diffMenuConfig } from "./diffMenus";
import { openDiffViewerWindow, registerDiffWindows } from "./diffWindows";

registerDiffWindows();

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

export function App() {
  const didOpenViewerRef = useRef(false);
  const menuHandlers = useRef<NativeMenuActionHandlers>({
    openFolder: () => {
      openDiffViewerForSelectedFolder().catch(reportDiffAppControllerError);
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
      openDiffViewerWindow().catch(reportDiffAppControllerError);
    }
  }, []);

  return null;
}

export default App;
