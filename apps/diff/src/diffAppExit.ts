import { addAppExitListener, completeAppExit } from "@legend-apps/app-exit";
import type { UnsavedDiffMergeDraftReason } from "./confirmUnsavedDiffMergeDrafts";

export type DiffWindowExitPreparation = (reason: UnsavedDiffMergeDraftReason) => Promise<boolean>;

const windowExitPreparations = new Map<string, DiffWindowExitPreparation>();

export function registerDiffWindowExitPreparation(
  windowIdentifier: string,
  prepareForExit: DiffWindowExitPreparation,
) {
  windowExitPreparations.set(windowIdentifier, prepareForExit);
  return () => {
    if (windowExitPreparations.get(windowIdentifier) === prepareForExit) {
      windowExitPreparations.delete(windowIdentifier);
    }
  };
}

export async function prepareDiffWindowsForAppExit() {
  for (const prepareForExit of [...windowExitPreparations.values()]) {
    if (!await prepareForExit("quit")) {
      return false;
    }
  }
  return true;
}

export function installDiffAppExitHandler(reportError: (error: unknown) => void) {
  let exitInFlight = false;
  const subscription = addAppExitListener((event) => {
    if (event.reason === "requested" && !exitInFlight) {
      exitInFlight = true;
      prepareDiffWindowsForAppExit()
        .then((canExit) => {
          completeAppExit(canExit);
        })
        .catch((error: unknown) => {
          reportError(error);
          completeAppExit(false);
        })
        .finally(() => {
          exitInFlight = false;
        });
    }
  });

  return subscription;
}
