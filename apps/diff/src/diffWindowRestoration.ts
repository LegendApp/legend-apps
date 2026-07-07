import {
  addWindowClosedListener,
  addWindowMovedListener,
  addWindowResizedListener,
  type WindowFrameEvent,
} from "@legend-desktop/window-manager";
import { diffViewerWindowIdentifier } from "./appConstants";
import {
  getSavedDiffWindows,
  removeSavedDiffWindow,
  updateSavedDiffWindowFrame,
  type SavedDiffWindow,
} from "./diffAppMetadata";
import { openDiffViewerWindow } from "./diffWindows";

function isDiffViewerWindowIdentifier(identifier: string) {
  return identifier === diffViewerWindowIdentifier || identifier.startsWith(`${diffViewerWindowIdentifier}-`);
}

function handleWindowFrameEvent(event: WindowFrameEvent) {
  if (isDiffViewerWindowIdentifier(event.identifier)) {
    updateSavedDiffWindowFrame(event.identifier, event.frame);
  }
}

export function installDiffWindowRestoration() {
  const movedSubscription = addWindowMovedListener(handleWindowFrameEvent);
  const resizedSubscription = addWindowResizedListener(handleWindowFrameEvent);
  const closedSubscription = addWindowClosedListener(({ identifier }) => {
    if (isDiffViewerWindowIdentifier(identifier)) {
      removeSavedDiffWindow(identifier);
    }
  });

  return {
    remove() {
      movedSubscription.remove();
      resizedSubscription.remove();
      closedSubscription.remove();
    },
  };
}

function restoreSavedWindow(savedWindow: SavedDiffWindow) {
  return openDiffViewerWindow(savedWindow.source ?? null, {
    frame: savedWindow.frame,
    freshWindow: savedWindow.source === undefined,
    windowIdentifier: savedWindow.id,
  });
}

export async function restoreSavedDiffWindows() {
  const savedWindows = getSavedDiffWindows();
  for (const savedWindow of savedWindows.slice().reverse()) {
    await restoreSavedWindow(savedWindow);
  }
  return savedWindows.length;
}
