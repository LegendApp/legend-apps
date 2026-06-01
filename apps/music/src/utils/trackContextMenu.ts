import type { ContextMenuItem } from "@legend-desktop/context-menu";
import { revealInFinder } from "@legend-desktop/file-dialog";

export const TRACK_CONTEXT_MENU_ITEMS = {
    queueAdd: { id: "queue-add", title: "Add to Queue" } as const,
    queuePlayNext: { id: "queue-play-next", title: "Play Next" } as const,
    showInFinder: { id: "show-in-finder", title: "Show in Finder" } as const,
};

type BuildTrackContextMenuOptions = {
    includeQueueActions?: boolean;
    includeFinder?: boolean;
    extraItems?: ContextMenuItem[];
};

export function buildTrackContextMenuItems(options: BuildTrackContextMenuOptions = {}): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];

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
            await revealInFinder(filePath);
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
