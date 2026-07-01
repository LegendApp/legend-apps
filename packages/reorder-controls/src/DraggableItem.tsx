import { Portal } from "@gorhom/portal";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    type GestureResponderEvent,
    type LayoutChangeEvent,
    type LayoutRectangle,
    PanResponder,
    View,
} from "react-native";

import { useDragDrop } from "./DragDropContext";
import { resolveDragStartMetrics, type DragStartMetrics } from "./dragCoordinates";

type DragDataResolver<T> = T | (() => T);

const DRAG_ACTIVATION_DISTANCE = 8;
const DRAG_ACTIVATION_DELAY_MS = 120;

function finiteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

interface DraggableItemProps<T = any> {
    id: string;
    zoneId: string;
    data: DragDataResolver<T>;
    children: ReactNode;
    dragHitPoint?: "center" | "pointer";
    dragOverlayMode?: "local" | "portal";
    disabled?: boolean;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    className?: string;
}

export const DraggableItem = <T,>({
    id,
    zoneId,
    data,
    children,
    dragHitPoint = "pointer",
    dragOverlayMode = "portal",
    disabled = false,
    onDragStart,
    onDragEnd,
    className = "",
}: DraggableItemProps<T>) => {
    // Get the drag drop context
    const { draggedItem$, activeDropZone$, checkDropZones, getDropZoneById } = useDragDrop();

    // State for tracking position and dimensions
    const [_layout, setLayout] = useState<LayoutRectangle | null>(null);
    const initialPositionRef = useRef({ pageX: 0, pageY: 0 });
    const initialEventPositionRef = useRef({ pageX: 0, pageY: 0 });
    const initialItemCenterRef = useRef({ x: 0, y: 0 });
    const eventToMeasuredOffsetRef = useRef({ x: 0, y: 0 });
    const dragStartMetricsRef = useRef<DragStartMetrics | null>(null);
    const dragActivatedRef = useRef(false);
    const dragStartTimeRef = useRef(0);
    const [childMeasurements, setChildMeasurements] = useState<LayoutRectangle | null>(null);

    // Reference to the original view
    const viewRef = useRef<View>(null);
    const [originalPanResponder, setOriginalPanResponder] = useState<ReturnType<typeof PanResponder.create> | null>(null);

    // Portal item position state
    const [portalPosition, setPortalPosition] = useState({ top: 0, left: 0 });

    // State to track if we're in dragging mode
    const [isDragging, setIsDragging] = useState(false);
    // State to track if position is ready
    const [positionReady, setPositionReady] = useState(false);

    // Global position tracking for the dragged item
    const globalPositionRef = useRef({ x: 0, y: 0 });

    const [fadeOg, setFadeOg] = useState(false);

    // Animated values for position and scale
    const pan = useMemo(() => new Animated.ValueXY(), []);

    // Clean up animated values on unmount to prevent memory leaks
    useEffect(() => {
        // Clean up function
        return () => {
            // Remove any listeners from the Animated values
            pan.x.removeAllListeners();
            pan.y.removeAllListeners();
        };
    }, [pan]);

    useEffect(() => {
        requestAnimationFrame(() => {
            setFadeOg(isDragging);
        });
    }, [isDragging]);

    // Create the pan responder for the original item
    const resolveData = useCallback(() => {
        return typeof data === "function" ? (data as () => T)() : data;
    }, [data]);

    const eventCoordinates = (event: GestureResponderEvent) => ({
        locationX: event.nativeEvent.locationX,
        locationY: event.nativeEvent.locationY,
        pageX: event.nativeEvent.pageX,
        pageY: event.nativeEvent.pageY,
    });

    const updateDragPosition = (event: GestureResponderEvent, gestureState: { dx: number; dy: number }) => {
        const coordinates = eventCoordinates(event);
        const hasPageCoordinates = finiteNumber(coordinates.pageX) && finiteNumber(coordinates.pageY);
        const dragX = hasPageCoordinates
            ? coordinates.pageX - initialEventPositionRef.current.pageX
            : gestureState.dx;
        const dragY = hasPageCoordinates
            ? coordinates.pageY - initialEventPositionRef.current.pageY
            : gestureState.dy;

        pan.setValue({
            x: dragX,
            y: dragY,
        });

        globalPositionRef.current = {
            x: dragX,
            y: dragY,
        };

        const currentX = dragHitPoint === "center"
            ? initialItemCenterRef.current.x + dragX
            : hasPageCoordinates
                ? coordinates.pageX - eventToMeasuredOffsetRef.current.x
                : initialPositionRef.current.pageX + gestureState.dx;
        const currentY = dragHitPoint === "center"
            ? initialItemCenterRef.current.y + dragY
            : hasPageCoordinates
                ? coordinates.pageY - eventToMeasuredOffsetRef.current.y
                : initialPositionRef.current.pageY + gestureState.dy;

        checkDropZones(currentX, currentY);
    };

    // Shared function to handle drag end
    const handleDragEnd = useCallback(() => {
        if (!dragActivatedRef.current) {
            activeDropZone$.set(null);
            draggedItem$.set(null);
            setIsDragging(false);
            setPositionReady(false);
            dragActivatedRef.current = false;
            return;
        }

        const activeDropZoneId = activeDropZone$.get();
        const dropZone = activeDropZoneId ? getDropZoneById(activeDropZoneId) : undefined;
        const draggedItemValue = draggedItem$.get();
        const isDropped = Boolean(dropZone && draggedItemValue);

        if (isDropped && dropZone && draggedItemValue) {
            dropZone.onDrop(draggedItemValue);
        }

        activeDropZone$.set(null);
        dragActivatedRef.current = false;

        // Reset the drag state
        setIsDragging(false);
        setPositionReady(false);
        draggedItem$.set(null);

        // Animate back to the original position
        const animation = Animated.timing(pan, {
            toValue: { x: 0, y: 0 },
            duration: isDropped ? 0 : 150, // If dropped, snap instantly
            useNativeDriver: true,
        });

        // Start the animation and add a completion callback
        animation.start(({ finished }) => {
            if (finished) {
                // Trigger the drag end callback
                onDragEnd?.();

                // Ensure pan is fully reset to prevent offset on next drag
                pan.setOffset({ x: 0, y: 0 });
                pan.setValue({ x: 0, y: 0 });
                globalPositionRef.current = { x: 0, y: 0 };

                // Reset portal position to avoid stale position on next drag
                setPortalPosition({ top: 0, left: 0 });
            }
        });
    }, [activeDropZone$, draggedItem$, getDropZoneById, onDragEnd, pan]);

    useEffect(() => {
        setOriginalPanResponder(PanResponder.create({
            onStartShouldSetPanResponder: () => !disabled,
            onMoveShouldSetPanResponder: (_event, gestureState) => {
                if (disabled) {
                    return false;
                }

                const distance = Math.hypot(gestureState.dx, gestureState.dy);
                return distance >= DRAG_ACTIVATION_DISTANCE;
            },

            onPanResponderGrant: (e: GestureResponderEvent) => {
                // Ensure clean state before starting a new drag
                pan.flattenOffset();
                pan.setOffset({ x: 0, y: 0 });
                pan.setValue({ x: 0, y: 0 });
                globalPositionRef.current = { x: 0, y: 0 };
                dragStartMetricsRef.current = null;
                initialItemCenterRef.current = { x: 0, y: 0 };
                // Reset position ready state
                setPositionReady(false);
                dragActivatedRef.current = false;
                dragStartTimeRef.current = Date.now();

                const coordinates = eventCoordinates(e);
                initialPositionRef.current = {
                    pageX: coordinates.pageX,
                    pageY: coordinates.pageY,
                };
                initialEventPositionRef.current = {
                    pageX: coordinates.pageX,
                    pageY: coordinates.pageY,
                };
                initialItemCenterRef.current = {
                    x: coordinates.pageX,
                    y: coordinates.pageY,
                };
                eventToMeasuredOffsetRef.current = { x: 0, y: 0 };

                viewRef.current?.measureInWindow((x, y, width, height) => {
                    const metrics = resolveDragStartMetrics(coordinates, { x, y, width, height });
                    dragStartMetricsRef.current = metrics;
                    initialItemCenterRef.current = {
                        x: x + width / 2,
                        y: y + height / 2,
                    };
                    initialPositionRef.current = {
                        pageX: metrics.pointerWindowX,
                        pageY: metrics.pointerWindowY,
                    };
                    eventToMeasuredOffsetRef.current = {
                        x: coordinates.pageX - metrics.pointerWindowX,
                        y: coordinates.pageY - metrics.pointerWindowY,
                    };
                });
            },

            onPanResponderMove: (_e: GestureResponderEvent, gestureState) => {
                // Don't activate drag until the movement threshold is exceeded
                if (!dragActivatedRef.current) {
                    const distance = Math.hypot(gestureState.dx, gestureState.dy);
                    const elapsed = Date.now() - dragStartTimeRef.current;
                    if (distance < DRAG_ACTIVATION_DISTANCE || elapsed < DRAG_ACTIVATION_DELAY_MS) {
                        return;
                    }

                    dragActivatedRef.current = true;
                    // Clear any previous drop highlight
                    activeDropZone$.set(null);
                    // Trigger the drag start callback
                    onDragStart?.();
                    // Set the dragged item in the context
                    const dragData = resolveData();
                    draggedItem$.set({
                        id,
                        data: dragData,
                        sourceZoneId: zoneId,
                    });

                    if (viewRef.current) {
                        const coordinates = eventCoordinates(_e);
                        viewRef.current.measureInWindow((x, y, width, height) => {
                            const metrics = resolveDragStartMetrics(coordinates, { x, y, width, height });
                            dragStartMetricsRef.current = metrics;
                            initialItemCenterRef.current = {
                                x: x + width / 2,
                                y: y + height / 2,
                            };
                            eventToMeasuredOffsetRef.current = {
                                x: coordinates.pageX - metrics.pointerWindowX,
                                y: coordinates.pageY - metrics.pointerWindowY,
                            };
                            setPortalPosition({
                                left: metrics.itemWindowX,
                                top: metrics.itemWindowY,
                            });
                            setPositionReady(true);
                        });
                    } else {
                        const metrics = resolveDragStartMetrics(_e.nativeEvent);
                        dragStartMetricsRef.current = metrics;
                        setPortalPosition({
                            left: metrics.itemWindowX,
                            top: metrics.itemWindowY,
                        });
                        setPositionReady(true);
                    }

                    setIsDragging(true);
                }

                if (!dragActivatedRef.current) {
                    return;
                }

                if (!dragStartMetricsRef.current) {
                    return;
                }

                updateDragPosition(_e, gestureState);
            },

            onPanResponderRelease: (event, gestureState) => {
                if (dragActivatedRef.current) {
                    updateDragPosition(event, gestureState);
                }
                handleDragEnd();
            },
        }));
    }, [
        activeDropZone$,
        checkDropZones,
        disabled,
        dragHitPoint,
        dragOverlayMode,
        draggedItem$,
        handleDragEnd,
        id,
        onDragStart,
        pan,
        resolveData,
        zoneId,
    ]);

    // Handle layout changes
    const onLayout = (event: LayoutChangeEvent) => {
        setLayout(event.nativeEvent.layout);
        setChildMeasurements(event.nativeEvent.layout);
    };

    const dragOverlay = isDragging && positionReady && childMeasurements ? (
        <Animated.View
            className="rounded-md"
            pointerEvents="none"
            style={[
                {
                    position: "absolute",
                    top: dragOverlayMode === "local" ? -1 : portalPosition.top - 1,
                    left: dragOverlayMode === "local" ? -1 : portalPosition.left - 1,
                    width: childMeasurements.width + 2,
                    height: childMeasurements.height + 2,
                    zIndex: 9999,
                    transform: [{ translateX: pan.x }, { translateY: pan.y }],
                    // Apply drop shadow styling here if desired,
                },
            ]}
        >
            <View className="rounded-md overflow-hidden">{children}</View>
        </Animated.View>
    ) : null;

    return (
        <View className="flex-grow-0">
            {/* Placeholder that stays in place */}
            <View ref={viewRef} onLayout={onLayout} className={className} style={{}}>
                <View
                    {...(originalPanResponder?.panHandlers ?? {})}
                    // eslint-disable-next-line react-native/no-inline-styles
                    style={{
                        opacity: isDragging && fadeOg ? 0.2 : 1,
                    }}
                >
                    {children}
                </View>
                {dragOverlayMode === "local" ? dragOverlay : null}
            </View>

            {/* Dragged item in portal */}
            {dragOverlayMode === "portal" && dragOverlay ? <Portal>{dragOverlay}</Portal> : null}
        </View>
    );
};
