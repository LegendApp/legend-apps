import type { NativeMenuAction, NativeMenuActionHandlers } from "@legend-apps/native-menu";

type RecentDocumentHandler = (path: string) => Promise<void>;

let currentMenuHandlers: NativeMenuActionHandlers | null = null;
let currentRecentDocumentHandler: RecentDocumentHandler | null = null;

export function registerMarkdownEditorMenuHandlers(handlers: NativeMenuActionHandlers) {
  currentMenuHandlers = handlers;

  return () => {
    if (currentMenuHandlers === handlers) {
      currentMenuHandlers = null;
    }
  };
}

export function dispatchMarkdownEditorMenuAction(action: NativeMenuAction) {
  const handler = currentMenuHandlers?.[action.itemId];
  if (!handler) {
    return false;
  }

  handler(action);
  return true;
}

export function registerMarkdownEditorRecentDocumentHandler(handler: RecentDocumentHandler) {
  currentRecentDocumentHandler = handler;

  return () => {
    if (currentRecentDocumentHandler === handler) {
      currentRecentDocumentHandler = null;
    }
  };
}

export function getMarkdownEditorRecentDocumentHandler() {
  return currentRecentDocumentHandler;
}
