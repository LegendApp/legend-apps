import type { NativeMenuAction } from "@legend-apps/native-menu";

type DiffViewerActionId =
  | "copyFilePath"
  | "copyRelativePath"
  | "copySource"
  | "filterFiles"
  | "nextHunk"
  | "previousHunk"
  | "reload"
  | "revealInFinder"
  | "save"
  | "showOnlyHunks"
  | "toggleSidebar";
type DiffViewerActionHandlers = Partial<Record<DiffViewerActionId, (action?: NativeMenuAction) => boolean | void>>;

let currentHandlers: DiffViewerActionHandlers | null = null;

export function registerDiffViewerActionHandlers(handlers: DiffViewerActionHandlers) {
  currentHandlers = handlers;

  return () => {
    if (currentHandlers === handlers) {
      currentHandlers = null;
    }
  };
}

export function dispatchDiffViewerAction(action: NativeMenuAction) {
  const handler = currentHandlers?.[action.itemId as DiffViewerActionId];
  return handler ? handler(action) !== false : false;
}
