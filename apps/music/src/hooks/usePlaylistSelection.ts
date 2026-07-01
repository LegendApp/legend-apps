import type { Observable } from "@legendapp/state";
import { useObservable } from "@legendapp/state/react";
import { useStableCallback } from "@legend-desktop/runtime-utils";
import type { NativeMouseEvent } from "@/types/NativeMouseEvent";
import { playlistNavigationState$ } from "@/state/playlistNavigationState";
import { keysPressed$, useOnHotkeys } from "@/systems/keyboard/Keyboard";
import { KeyCodes } from "@/systems/keyboard/KeyboardManager";
import { state$ } from "@/systems/State";

interface UsePlaylistSelectionOptions<T extends { isSeparator?: boolean }> {
    items: T[];
    onDeleteSelection?: (indices: number[]) => void;
}

interface UsePlaylistSelectionResult {
    selectedIndices$: Observable<Set<number>>;
    handleTrackClick: (index: number, event?: NativeMouseEvent) => void;
    syncSelectionAfterReorder: (fromIndex: number, toIndex: number) => void;
    clearSelection: () => void;
}

function createRangeSelection(start: number, end: number): Set<number> {
    const [minIndex, maxIndex] = start < end ? [start, end] : [end, start];
    const selection = new Set<number>();

    for (let i = minIndex; i <= maxIndex; i += 1) {
        selection.add(i);
    }

    return selection;
}

export function usePlaylistSelection<T extends { isSeparator?: boolean }>(
    options: UsePlaylistSelectionOptions<T>,
): UsePlaylistSelectionResult {
    const { items, onDeleteSelection } = options;
    const selectedIndices$ = useObservable<Set<number>>(new Set());
    const selectionAnchor$ = useObservable<number>(-1);
    const selectionFocus$ = useObservable<number>(-1);
    const itemsLength = items.length;

    const updateSelectionState = useStableCallback((nextSelection: Set<number>) => {
        selectedIndices$.set(nextSelection);
        playlistNavigationState$.hasSelection.set(nextSelection.size > 0);
    });

    const setAnchorAndFocus = useStableCallback((anchor: number, focus: number) => {
        selectionAnchor$.set(anchor);
        selectionFocus$.set(focus);
    });

    const clearSelection = useStableCallback(() => {
        const currentSelection = selectedIndices$.get();
        if (currentSelection.size === 0 && selectionAnchor$.get() === -1 && selectionFocus$.get() === -1) {
            return;
        }

        updateSelectionState(new Set());
        setAnchorAndFocus(-1, -1);
    });

    const applySingleSelection = useStableCallback((index: number) => {
        updateSelectionState(new Set<number>([index]));
        setAnchorAndFocus(index, index);
    });

    const applyRangeSelection = useStableCallback((anchor: number, focus: number) => {
        updateSelectionState(createRangeSelection(anchor, focus));
        selectionFocus$.set(focus);
    });

    const toggleSelection = useStableCallback((index: number) => {
        const nextSelection = new Set(selectedIndices$.get());

        if (nextSelection.has(index)) {
            nextSelection.delete(index);
            updateSelectionState(nextSelection);

            if (nextSelection.size === 0) {
                setAnchorAndFocus(-1, -1);
                return;
            }

            if (selectionFocus$.get() === index) {
                const nextFocus = Math.min(...nextSelection);
                selectionFocus$.set(nextFocus);

                if (!nextSelection.has(selectionAnchor$.get())) {
                    selectionAnchor$.set(nextFocus);
                }
            }

            return;
        }

        nextSelection.add(index);
        updateSelectionState(nextSelection);
        setAnchorAndFocus(index, index);
    });

    const isModifierPressed = useStableCallback((modifier: number) => {
        return Boolean(keysPressed$.get()[modifier]);
    });

    const canHandleHotkeys = useStableCallback(() => {
        if (itemsLength === 0) {
            return false;
        }

        if (playlistNavigationState$.isSearchDropdownOpen.get()) {
            return false;
        }

        return true;
    });

    const shouldHandleHotkeys = useStableCallback(() => {
        if (!canHandleHotkeys()) {
            return false;
        }

        if (state$.isDropdownOpen.get()) {
            return false;
        }

        return true;
    });

    const getPrimarySelectionIndex = useStableCallback(() => {
        const focusIndex = selectionFocus$.get();
        if (focusIndex !== -1) {
            return focusIndex;
        }
        const currentSelection = selectedIndices$.get();
        if (currentSelection.size === 0) {
            return -1;
        }
        return Math.min(...currentSelection);
    });

    const moveSelection = useStableCallback((direction: "up" | "down") => {
        if (!shouldHandleHotkeys()) {
            return;
        }

        const hasShift = isModifierPressed(KeyCodes.MODIFIER_SHIFT);
        const currentFocus = selectionFocus$.get();
        const currentSelection = selectedIndices$.get();
        const baseIndex =
            currentFocus !== -1
                ? currentFocus
                : currentSelection.size > 0
                  ? direction === "up"
                      ? Math.min(...currentSelection)
                      : Math.max(...currentSelection)
                  : direction === "up"
                    ? 0
                    : -1;

        const nextIndex =
            direction === "up"
                ? baseIndex <= 0
                    ? itemsLength - 1
                    : baseIndex - 1
                : baseIndex >= itemsLength - 1 || baseIndex === -1
                  ? 0
                  : baseIndex + 1;

        if (hasShift && selectionAnchor$.get() !== -1) {
            applyRangeSelection(selectionAnchor$.get(), nextIndex);
        } else {
            applySingleSelection(nextIndex);
        }
    });

    const moveSelectionUp = useStableCallback(() => {
        moveSelection("up");
    });

    const moveSelectionDown = useStableCallback(() => {
        moveSelection("down");
    });

    const syncSelectionAfterReorder = useStableCallback((fromIndex: number, toIndex: number) => {
        const length = itemsLength;
        if (length === 0) {
            return;
        }

        const boundedFrom = Math.max(0, Math.min(fromIndex, length - 1));
        const boundedTarget = Math.max(0, Math.min(toIndex, length));

        if (boundedFrom === boundedTarget || (boundedFrom < boundedTarget && boundedFrom + 1 === boundedTarget)) {
            return;
        }

        const isMovingDown = boundedFrom < boundedTarget;
        const finalIndex = isMovingDown
            ? Math.max(0, Math.min(boundedTarget - 1, length - 1))
            : Math.max(0, Math.min(boundedTarget, length - 1));

        const currentSelection = selectedIndices$.get();

        if (currentSelection.size === 0) {
            return;
        }

        const nextSelection = new Set<number>();
        currentSelection.forEach((index) => {
            if (index === boundedFrom) {
                nextSelection.add(finalIndex);
            } else if (isMovingDown && index > boundedFrom && index < boundedTarget) {
                nextSelection.add(index - 1);
            } else if (!isMovingDown && index >= boundedTarget && index < boundedFrom) {
                nextSelection.add(index + 1);
            } else {
                nextSelection.add(index);
            }
        });

        updateSelectionState(nextSelection);

        const adjustIndex = (index: number): number => {
            if (index === boundedFrom) {
                return finalIndex;
            }

            if (isMovingDown && index > boundedFrom && index < boundedTarget) {
                return index - 1;
            }

            if (!isMovingDown && index >= boundedTarget && index < boundedFrom) {
                return index + 1;
            }

            return index;
        };

        const anchor = selectionAnchor$.get();
        if (anchor !== -1) {
            selectionAnchor$.set(adjustIndex(anchor));
        }

        const focus = selectionFocus$.get();
        if (focus !== -1) {
            selectionFocus$.set(adjustIndex(focus));
        }
    });

    const handleTrackClick = useStableCallback((index: number, event?: NativeMouseEvent) => {
        const track = items[index];

        if (track?.isSeparator) {
            return;
        }

        const isShiftPressed = event?.shiftKey;
        const isMultiToggle = event?.metaKey || event?.ctrlKey;
        if (__DEV__) {
            console.log("Queue -> select index", index, {
                shift: isShiftPressed,
                meta: isMultiToggle,
            });
        }

        if (isShiftPressed) {
            const anchorIndex = selectionAnchor$.get();
            const start = anchorIndex !== -1 ? anchorIndex : index;
            applyRangeSelection(start, index);
            if (anchorIndex === -1) {
                selectionAnchor$.set(index);
            }
            return;
        }

        if (isMultiToggle) {
            toggleSelection(index);
            return;
        }

        applySingleSelection(index);
    });

    const activateSelection = useStableCallback(() => {
        if (!shouldHandleHotkeys()) {
            return;
        }

        const currentIndex = getPrimarySelectionIndex();
        if (currentIndex >= 0 && currentIndex < itemsLength) {
            handleTrackClick(currentIndex);
        }
    });

    const handleDeleteHotkey = useStableCallback(() => {
        console.log("Playlist.handleDeleteHotkey", { canHandleHotkeys: canHandleHotkeys() });
        if (!onDeleteSelection || !canHandleHotkeys()) {
            return;
        }

        const currentSelection = selectedIndices$.get();
        if (currentSelection.size === 0) {
            return;
        }

        const indices = Array.from(currentSelection).sort((a, b) => a - b);
        onDeleteSelection(indices);
        clearSelection();
    });

    const selectAllItems = useStableCallback(() => {
        if (!shouldHandleHotkeys()) {
            return;
        }

        if (items.length === 0) {
            clearSelection();
            return;
        }

        const selectableIndices: number[] = [];
        for (let index = 0; index < items.length; index += 1) {
            if (!items[index]?.isSeparator) {
                selectableIndices.push(index);
            }
        }

        if (selectableIndices.length === 0) {
            clearSelection();
            return;
        }

        updateSelectionState(new Set(selectableIndices));
        setAnchorAndFocus(selectableIndices[0], selectableIndices[selectableIndices.length - 1]);
    });

    const handleEscapeHotkey = useStableCallback(() => {
        if (!shouldHandleHotkeys()) {
            return;
        }

        clearSelection();
    });

    const deleteHotkey = onDeleteSelection ? handleDeleteHotkey : undefined;

    useOnHotkeys({
        Up: moveSelectionUp,
        Down: moveSelectionDown,
        Enter: activateSelection,
        Space: activateSelection,
        Delete: deleteHotkey,
        Backspace: deleteHotkey,
        ForwardDelete: deleteHotkey,
        SelectAll: selectAllItems,
        Escape: handleEscapeHotkey,
    });

    return {
        selectedIndices$,
        handleTrackClick,
        syncSelectionAfterReorder,
        clearSelection,
    };
}
