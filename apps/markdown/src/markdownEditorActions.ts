import type { MenuAction } from "@legendapp/spark/menus";
import { createDocumentWindowRegistry } from "@legend-apps/workspace";

export type MarkdownMenuHandlers = Record<string, (action: MenuAction) => unknown>;

type RecentDocumentHandler = (path: string) => Promise<void>;

const menuHandlerWindows = createDocumentWindowRegistry<{ handlers: MarkdownMenuHandlers; refreshMenuState: () => void }>();
const recentDocumentWindows = createDocumentWindowRegistry<RecentDocumentHandler>();

export function registerMarkdownEditorMenuHandlers(windowId: string, handlers: MarkdownMenuHandlers, refreshMenuState: () => void) {
  return menuHandlerWindows.register(windowId, { handlers, refreshMenuState });
}

export function refreshMarkdownEditorMenuState() {
  const target = menuHandlerWindows.active();
  target?.refreshMenuState();
  return !!target;
}

/** Dispatches to the most recently focused editor window. */
export function dispatchMarkdownEditorMenuAction(action: MenuAction) {
  const handler = menuHandlerWindows.active()?.handlers[action.itemId];
  if (!handler) {
    return false;
  }

  handler(action);
  return true;
}

export function registerMarkdownEditorRecentDocumentHandler(windowId: string, handler: RecentDocumentHandler) {
  return recentDocumentWindows.register(windowId, handler);
}

export function getMarkdownEditorRecentDocumentHandler() {
  return recentDocumentWindows.active() ?? null;
}
