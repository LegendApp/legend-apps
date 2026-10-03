import { ownRegistration } from "@legend-apps/runtime-utils";
import { beforeQuit } from "@legendapp/spark/app";
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

export async function prepareDiffWindowsForTransition(reason: UnsavedDiffMergeDraftReason) {
  for (const prepareForExit of [...windowExitPreparations.values()]) {
    if (!await prepareForExit(reason)) {
      return false;
    }
  }
  return true;
}

export async function prepareDiffWindowForTransition(windowIdentifier: string, reason: UnsavedDiffMergeDraftReason) {
  return await windowExitPreparations.get(windowIdentifier)?.(reason) ?? true;
}

export function prepareDiffWindowsForAppExit() {
  return prepareDiffWindowsForTransition("quit");
}

export function installDiffAppExitHandler(reportError: (error: unknown) => void) {
  return ownRegistration(beforeQuit(prepareDiffWindowsForAppExit, { onError: reportError }), reportError);
}
