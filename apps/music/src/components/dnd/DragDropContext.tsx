import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { createContext, type ReactNode, useContext, useRef } from "react";
import { type LayoutRectangle, View } from "react-native";

const MAX_VERTICAL_PROXIMITY = 80;

export type DropZoneHitSlop =
    | number
    | Partial<{
          top: number;
          right: number;
          bottom: number;
          left: number;
      }>;

// Type for the dragged item
export interface DraggedItem<T = any> {
    id: string;
    data: T;
    sourceZoneId: string;
}

// Type for the drag drop context
interface DragDropContextValue {
    draggedItem$: Observable<DraggedItem | null>;
    registerDropZone: (
        id: string,
        rect: LayoutRectangle,
        allowDrop: (item: DraggedItem) => boolean,
        onDrop: (item: DraggedItem) => void,
        options?: { disableProximityDetection?: boolean; hitSlop?: DropZoneHitSlop },
    ) => void;
    unregisterDropZone: (id: string) => void;
    updateDropZoneRect: (id: string, rect: LayoutRectangle) => void;
    getDropZoneById: (id: string) => DropZone | undefined;
    activeDropZone$: Observable<string | null>;
    checkDropZones: (x: number, y: number) => void;
}

// Type for a drop zone
export interface DropZone {
    id: string;
    rect: LayoutRectangle;
    allowDrop: (item: DraggedItem) => boolean;
    onDrop: (item: DraggedItem) => void;
    disableProximityDetection?: boolean;
    hitSlop?: DropZoneHitSlop;
}

// Create context
const DragDropContext = createContext<DragDropContextValue | null>(null);

// Custom hook to use the drag drop context
export const useDragDrop = () => {
    const context = useContext(DragDropContext);
    if (!context) {
        throw new Error("useDragDrop must be used within a DragDropProvider");
    }
    return context;
};

// Props for the drag drop provider
interface DragDropProviderProps {
    children: ReactNode;
}

// DragDropProvider component
export const DragDropProvider = ({ children }: DragDropProviderProps) => {
    // State for the dragged item
    const draggedItem$ = useObservable<DraggedItem | null>(null);

    // State for the active drop zone
    const activeDropZone$ = useObservable<string | null>(null);

    // Ref for the drop zones
    const dropZonesRef = useRef<Map<string, DropZone>>(new Map());

    // Access current values
    const activeDropZone = useValue(activeDropZone$);

    const resolveHitSlop = (hitSlop?: DropZoneHitSlop) => {
        if (typeof hitSlop === "number") {
            return { top: hitSlop, right: hitSlop, bottom: hitSlop, left: hitSlop };
        }

        return {
            top: hitSlop?.top ?? 0,
            right: hitSlop?.right ?? 0,
            bottom: hitSlop?.bottom ?? 0,
            left: hitSlop?.left ?? 0,
        };
    };

    const applyHitSlopToRect = (rect: LayoutRectangle, hitSlop?: DropZoneHitSlop): LayoutRectangle => {
        const slop = resolveHitSlop(hitSlop);

        return {
            x: rect.x - slop.left,
            y: rect.y - slop.top,
            width: Math.max(0, rect.width + slop.left + slop.right),
            height: Math.max(0, rect.height + slop.top + slop.bottom),
        };
    };

    // Register a drop zone
    const registerDropZone = (
        id: string,
        rect: LayoutRectangle,
        allowDrop: (item: DraggedItem) => boolean,
        onDrop: (item: DraggedItem) => void,
        options?: { disableProximityDetection?: boolean; hitSlop?: DropZoneHitSlop },
    ) => {
        const rectWithHitSlop = applyHitSlopToRect(rect, options?.hitSlop);
        dropZonesRef.current.set(id, { id, rect: rectWithHitSlop, allowDrop, onDrop, ...options });
    };

    // Unregister a drop zone
    const unregisterDropZone = (id: string) => {
        dropZonesRef.current.delete(id);
    };

    // Update a drop zone's rect
    const updateDropZoneRect = (id: string, rect: LayoutRectangle) => {
        const dropZone = dropZonesRef.current.get(id);
        if (dropZone) {
            const rectWithHitSlop = applyHitSlopToRect(rect, dropZone.hitSlop);
            dropZonesRef.current.set(id, { ...dropZone, rect: rectWithHitSlop });
        }
    };

    // Get a drop zone by id
    const getDropZoneById = (id: string) => {
        return dropZonesRef.current.get(id);
    };

    // Check if an item is over any drop zones
    const checkDropZones = (x: number, y: number) => {
        const draggedItem = draggedItem$.get();
        if (!draggedItem) return;

        let foundDropZone = false;
        let closestZoneId: string | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        // Check each drop zone
        for (const [zoneId, dropZone] of dropZonesRef.current.entries()) {
            const { rect, allowDrop } = dropZone;

            // Check if the point is inside the drop zone
            const isInside = x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

            // Check if the drop zone allows this item to be dropped
            const canDrop = allowDrop(draggedItem);

            if (isInside && canDrop) {
                if (activeDropZone !== zoneId) {
                    activeDropZone$.set(zoneId);
                }
                foundDropZone = true;
                break;
            }

            if (canDrop && !dropZone.disableProximityDetection) {
                const withinHorizontalBounds = x >= rect.x && x <= rect.x + rect.width;
                if (withinHorizontalBounds) {
                    const centerY = rect.y + rect.height / 2;
                    const distance = Math.abs(centerY - y);
                    if (distance < closestDistance && distance <= MAX_VERTICAL_PROXIMITY) {
                        closestDistance = distance;
                        closestZoneId = zoneId;
                    }
                }
            }
        }

        if (!foundDropZone && closestZoneId !== null) {
            if (activeDropZone !== closestZoneId) {
                activeDropZone$.set(closestZoneId);
            }
            foundDropZone = true;
        }

        // If no drop zone was found, clear the active drop zone
        if (!foundDropZone && activeDropZone !== null) {
            activeDropZone$.set(null);
        }
    };

    // Value for the context
    const value: DragDropContextValue = {
        draggedItem$,
        registerDropZone,
        unregisterDropZone,
        updateDropZoneRect,
        getDropZoneById,
        activeDropZone$,
        checkDropZones,
    };

    return (
        <DragDropContext.Provider value={value}>
            <View className="flex-1">{children}</View>
        </DragDropContext.Provider>
    );
};
