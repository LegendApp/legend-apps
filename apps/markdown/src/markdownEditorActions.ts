import type { MenuAction } from "@legendapp/spark/menus";

export type MarkdownMenuHandlers = Record<string, (action: MenuAction) => unknown>;

type RecentDocumentHandler = (path: string) => Promise<void>;

let currentMenuHandlers: MarkdownMenuHandlers | null = null;
let currentRecentDocumentHandler: RecentDocumentHandler | null = null;

export function registerMarkdownEditorMenuHandlers(handlers: MarkdownMenuHandlers) {
  currentMenuHandlers = handlers;

  return () => {
    if (currentMenuHandlers === handlers) {
      currentMenuHandlers = null;
    }
  };
}

export function dispatchMarkdownEditorMenuAction(action: MenuAction) {
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
