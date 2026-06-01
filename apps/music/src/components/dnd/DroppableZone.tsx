import { useValue } from "@legendapp/state/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { type LayoutChangeEvent, type LayoutRectangle, View } from "react-native";

import { cn } from "@/utils/cn";
import { type DraggedItem, type DropZoneHitSlop, useDragDrop } from "./DragDropContext";

type DroppableZoneChildren = ReactNode | ((isActive: boolean) => ReactNode);

interface DroppableZoneProps {
    id?: string;
    allowDrop: (item: DraggedItem) => boolean;
    onDrop: (item: DraggedItem) => void;
    children?: DroppableZoneChildren;
    className?: string;
    activeClassName?: string;
    disableProximityDetection?: boolean;
    hitSlop?: DropZoneHitSlop;
}

export const DroppableZone = ({
    id: propId,
    allowDrop,
    onDrop,
    children,
    className = "",
    activeClassName = "",
    disableProximityDetection = false,
    hitSlop,
}: DroppableZoneProps) => {
    // Generate an ID if one wasn't provided
    const generatedId = useId();
    const id = propId || generatedId;

    // Get the drag drop context
    const { registerDropZone, unregisterDropZone, updateDropZoneRect, draggedItem$, activeDropZone$ } = useDragDrop();

    // Access the current values of observables
    const draggedItem = useValue(draggedItem$);
    const activeDropZone = useValue(activeDropZone$);

    // Keep track of the zone's layout
    const layoutRef = useRef<LayoutRectangle>({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    });
    const viewRef = useRef<View>(null);

    // Register the drop zone on mount and unregister on unmount
    useEffect(() => {
        registerDropZone(id, layoutRef.current, allowDrop, onDrop, { disableProximityDetection, hitSlop });

        return () => {
            unregisterDropZone(id);
        };
    }, [id, registerDropZone, unregisterDropZone, allowDrop, onDrop, disableProximityDetection, hitSlop]);

    // Handle layout changes
    const updateRectFromWindow = () => {
        if (!viewRef.current) {
            return;
        }

        viewRef.current.measureInWindow((x, y, width, height) => {
            const rect: LayoutRectangle = {
                x,
                y,
                width,
                height,
            };

            Object.assign(layoutRef.current, rect);
            updateDropZoneRect(id, rect);
        });
    };

    const onLayout = (_event: LayoutChangeEvent) => {
        updateRectFromWindow();
    };

    // useEffect(() => {
    //     if (draggedItem) {
    //         requestAnimationFrame(updateRectFromWindow);
    //     }
    // }, [draggedItem]);

    // Determine if this zone is active (has a dragged item over it)
    const isActive = draggedItem !== null && activeDropZone === id;

    const renderedChildren = typeof children === "function" ? children(isActive) : children;

    return (
        <View
            ref={viewRef}
            pointerEvents="none"
            onLayout={onLayout}
            className={cn(className, isActive && activeClassName)}
        >
            {renderedChildren}
        </View>
    );
};
