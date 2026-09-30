import type { MenuItem } from "@legendapp/spark/context-menu";
import { revealInFileManager } from "@legendapp/spark/files";

export const TRACK_CONTEXT_MENU_ITEMS = {
    queueAdd: { type: "action", id: "queue-add", label: "Add to Queue" } as const,
    queuePlayNext: { type: "action", id: "queue-play-next", label: "Play Next" } as const,
    showInFinder: { type: "action", id: "show-in-finder", label: "Show in Finder" } as const,
};

type BuildTrackContextMenuOptions = {
    includeQueueActions?: boolean;
    includeFinder?: boolean;
    extraItems?: MenuItem[];
};

export function buildTrackContextMenuItems(options: BuildTrackContextMenuOptions = {}): MenuItem[] {
    const items: MenuItem[] = [];

    if (options.includeQueueActions) {
        items.push(TRACK_CONTEXT_MENU_ITEMS.queueAdd, TRACK_CONTEXT_MENU_ITEMS.queuePlayNext);
    }

    if (options.includeFinder) {
        items.push(TRACK_CONTEXT_MENU_ITEMS.showInFinder);
    }

    if (options.extraItems?.length) {
        items.push(...options.extraItems);
    }

    return items;
}

type QueueAction = "enqueue" | "play-next";

interface HandleTrackContextMenuSelectionOptions {
    selection: string | null;
    filePath?: string | null;
    onQueueAction?: (action: QueueAction) => void;
    onCustomSelect?: (selection: string) => void | Promise<void>;
}

export async function handleTrackContextMenuSelection({
    selection,
    filePath,
    onQueueAction,
    onCustomSelect,
}: HandleTrackContextMenuSelectionOptions): Promise<void> {
    if (!selection) {
        return;
    }

    if (selection === TRACK_CONTEXT_MENU_ITEMS.showInFinder.id) {
        if (filePath) {
            await revealInFileManager(filePath);
        }
        return;
    }

    if (selection === TRACK_CONTEXT_MENU_ITEMS.queuePlayNext.id) {
        onQueueAction?.("play-next");
        return;
    }

    if (selection === TRACK_CONTEXT_MENU_ITEMS.queueAdd.id) {
        onQueueAction?.("enqueue");
        return;
    }

    await onCustomSelect?.(selection);
}
