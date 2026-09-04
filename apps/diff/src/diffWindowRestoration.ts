import {
  addWindowClosedListener,
  setWindowOptions,
} from "@legend-apps/window-manager";
import { diffPrimaryWindowIdentifier, diffViewerWindowIdentifier } from "./appConstants";
import {
  getSavedDiffWindows,
  removeSavedDiffWindow,
  type SavedDiffWindow,
} from "./diffAppMetadata";
import { openDiffViewerWindow } from "./diffWindows";

function isDiffViewerWindowIdentifier(identifier: string) {
  return identifier === diffPrimaryWindowIdentifier ||
    identifier === diffViewerWindowIdentifier ||
    identifier.startsWith(`${diffViewerWindowIdentifier}-`);
}

export function installDiffWindowRestoration() {
  // AppKit owns every window frame so restoration can happen before React starts.
  const closedSubscription = addWindowClosedListener(({ identifier }) => {
    if (isDiffViewerWindowIdentifier(identifier)) {
      removeSavedDiffWindow(identifier);
    }
  });

  return {
    remove() {
      closedSubscription.remove();
    },
  };
}

export async function setDiffManagedWindowRestorationEnabled(enabled: boolean) {
  const identifiers = getSavedDiffWindows()
    .map((window) => window.id)
    .filter((identifier) => identifier !== diffPrimaryWindowIdentifier);
  await Promise.all(identifiers.map((identifier) =>
    setWindowOptions(identifier, { restoreOnLaunch: enabled }).catch(() => undefined)));
}

function restoreSavedWindow(savedWindow: SavedDiffWindow) {
  return openDiffViewerWindow(savedWindow.source ?? null, {
    frame: savedWindow.frame,
    freshWindow: savedWindow.source === undefined,
    windowIdentifier: savedWindow.id,
  });
}

export async function restoreSavedDiffWindows(
  openPrimaryWindow?: (source: SavedDiffWindow["source"]) => Promise<void>,
) {
  const savedWindows = getSavedDiffWindows();
  const primarySavedWindow = savedWindows.find((window) => window.id === diffPrimaryWindowIdentifier) ?? savedWindows[0];
  if (primarySavedWindow && openPrimaryWindow) {
    await openPrimaryWindow(primarySavedWindow.source);
  }
  const secondarySavedWindows = openPrimaryWindow
    ? savedWindows.filter((window) => window !== primarySavedWindow)
    : savedWindows;
  for (const savedWindow of secondarySavedWindows.slice().reverse()) {
    await restoreSavedWindow(savedWindow);
  }
  return savedWindows.length;
}
