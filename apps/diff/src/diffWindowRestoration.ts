import {
  addMainWindowMovedListener,
  addMainWindowResizedListener,
  addWindowClosedListener,
  addWindowMovedListener,
  addWindowResizedListener,
  type WindowFrameEvent,
} from "@legend-apps/window-manager";
import { diffPrimaryWindowIdentifier, diffViewerWindowIdentifier } from "./appConstants";
import {
  getSavedDiffWindows,
  removeSavedDiffWindow,
  updateSavedDiffWindowFrame,
  type SavedDiffWindow,
} from "./diffAppMetadata";
import { openDiffViewerWindow } from "./diffWindows";

function isDiffViewerWindowIdentifier(identifier: string) {
  return identifier === diffPrimaryWindowIdentifier ||
    identifier === diffViewerWindowIdentifier ||
    identifier.startsWith(`${diffViewerWindowIdentifier}-`);
}

function handleWindowFrameEvent(event: WindowFrameEvent) {
  if (isDiffViewerWindowIdentifier(event.identifier)) {
    updateSavedDiffWindowFrame(event.identifier, event.frame);
  }
}

export function installDiffWindowRestoration() {
  const mainMovedSubscription = addMainWindowMovedListener((frame) => {
    updateSavedDiffWindowFrame(diffPrimaryWindowIdentifier, frame);
  });
  const mainResizedSubscription = addMainWindowResizedListener((frame) => {
    updateSavedDiffWindowFrame(diffPrimaryWindowIdentifier, frame);
  });
  const movedSubscription = addWindowMovedListener(handleWindowFrameEvent);
  const resizedSubscription = addWindowResizedListener(handleWindowFrameEvent);
  const closedSubscription = addWindowClosedListener(({ identifier }) => {
    if (isDiffViewerWindowIdentifier(identifier)) {
      removeSavedDiffWindow(identifier);
    }
  });

  return {
    remove() {
      mainMovedSubscription.remove();
      mainResizedSubscription.remove();
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

export async function restoreSavedDiffWindows(
  openPrimaryWindow?: (savedWindow: SavedDiffWindow) => Promise<void>,
) {
  const savedWindows = getSavedDiffWindows();
  const primarySavedWindow = savedWindows.find((window) => window.id === diffPrimaryWindowIdentifier) ?? savedWindows[0];
  if (primarySavedWindow && openPrimaryWindow) {
    await openPrimaryWindow(primarySavedWindow);
  }
  const secondarySavedWindows = openPrimaryWindow
    ? savedWindows.filter((window) => window !== primarySavedWindow)
    : savedWindows;
  for (const savedWindow of secondarySavedWindows.slice().reverse()) {
    await restoreSavedWindow(savedWindow);
  }
  return savedWindows.length;
}
