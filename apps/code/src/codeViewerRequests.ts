import { observable } from "@legendapp/state";
import { createDocumentWindowRegistry } from "@legend-apps/workspace";

export type CodeViewerWindowTarget = {
  command: (itemId: string) => void;
  openFile: (path: string) => void;
  windowId: string;
};

export const codeViewerWindows = createDocumentWindowRegistry<CodeViewerWindowTarget>();

/** Opens the file as a tab in the most recently focused viewer, returning that viewer if one is open. */
export function requestCodeViewerFile(path: string) {
  const target = codeViewerWindows.active();
  target?.openFile(path);
  return target;
}

export function dispatchCodeViewerMenu(itemId: string) {
  codeViewerWindows.active()?.command(itemId);
}

export const codeAutomaticPairs$ = observable(true);
