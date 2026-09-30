import { diffActiveMenuWindow$ } from "./diffMenuState";
import type { MenuAction } from "@legendapp/spark/menus";

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
type DiffViewerActionHandlers = Partial<Record<DiffViewerActionId, (action?: MenuAction) => boolean | void>>;

const windowHandlers = new Map<string, DiffViewerActionHandlers>();

export function registerDiffViewerActionHandlers(windowId: string, handlers: DiffViewerActionHandlers) {
  windowHandlers.set(windowId, handlers);

  return () => {
    if (windowHandlers.get(windowId) === handlers) {
      windowHandlers.delete(windowId);
    }
  };
}

export function dispatchDiffViewerAction(action: MenuAction) {
  const handler = windowHandlers.get(diffActiveMenuWindow$.peek())?.[action.itemId as DiffViewerActionId];
  return handler ? handler(action) !== false : false;
}
