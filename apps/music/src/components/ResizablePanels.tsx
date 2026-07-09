import type { Observable } from "@legendapp/state";
import { useMount, useObservable, useValue } from "@legendapp/state/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { type GestureResponderEvent, PanResponder, type PanResponderGestureState, View } from "react-native";

import { useRefValue } from "@legend-apps/runtime-utils";
import { settings$ } from "../systems/Settings";
import { cn } from "@legend-apps/classnames";

interface PanelConfig {
    id: string;
    minSize: number;
    maxSize: number | undefined;
    defaultSize: number;
    order: number;
}

interface PanelContextValue {
    direction: "horizontal" | "vertical";
    registerPanel: (panel: PanelConfig, sizeObservable: Observable<number>) => void;
    unregisterPanel: (panelId: string) => void;
    updatePanelSizes: (panelId: string, delta: number) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

function usePanelContext(): PanelContextValue {
    const context = useContext(PanelContext);

    if (!context) {
        throw new Error("Panel components must be used within a PanelGroup");
    }

    return context;
}

interface PanelGroupProps {
    children: ReactNode;
    direction?: "horizontal" | "vertical";
    className?: string;
}

export function PanelGroup({ children, direction = "horizontal", className }: PanelGroupProps) {
    const panels$ = settings$.state.panels;
    const panelConfigsRef = useRef<Record<string, PanelConfig>>({});
    const panelsArrayRef = useRef<PanelConfig[]>([]);
    const containerSize$ = useObservable<number>(1000);

    const registerPanel = useCallback(
        (panel: PanelConfig) => {
            if (!panelConfigsRef.current[panel.id]) {
                panelConfigsRef.current[panel.id] = panel;
                panelsArrayRef.current.push(panel);
                panelsArrayRef.current.sort((a, b) => a.order - b.order);

                const savedSize = panels$.peek()[panel.id];
                let initialSize = typeof savedSize === "number" ? savedSize : panel.defaultSize;
                initialSize = Math.max(panel.minSize, initialSize);

                if (panel.maxSize !== undefined) {
                    initialSize = Math.min(panel.maxSize, initialSize);
                }

                panels$[panel.id].set(initialSize);
            }
        },
        [panels$],
    );

    const unregisterPanel = useCallback((panelId: string) => {
        if (panelConfigsRef.current[panelId]) {
            delete panelConfigsRef.current[panelId];
            panelsArrayRef.current = panelsArrayRef.current.filter((panel) => panel.id !== panelId);
        }
    }, []);

    const updatePanelSizes = useCallback(
        (panelId: string, deltaPixels: number) => {
            const allPanels = panelsArrayRef.current;
            const currentPanelIndex = allPanels.findIndex((panel) => panel.id === panelId);
            const currentPanel = allPanels[currentPanelIndex];
            const nextPanel = allPanels[currentPanelIndex + 1];

            if (currentPanel && nextPanel) {
                const currentSize = panels$[currentPanel.id].peek();
                const nextSize = panels$[nextPanel.id].peek();
                let nextCurrentSize = currentSize + deltaPixels;
                let nextAdjacentSize = nextSize - deltaPixels;

                nextCurrentSize = Math.max(currentPanel.minSize, nextCurrentSize);
                nextAdjacentSize = Math.max(nextPanel.minSize, nextAdjacentSize);

                if (currentPanel.maxSize !== undefined) {
                    nextCurrentSize = Math.min(currentPanel.maxSize, nextCurrentSize);
                }
                if (nextPanel.maxSize !== undefined) {
                    nextAdjacentSize = Math.min(nextPanel.maxSize, nextAdjacentSize);
                }

                panels$[currentPanel.id].set(nextCurrentSize);
                panels$[nextPanel.id].set(nextAdjacentSize);
            }
        },
        [panels$],
    );

    const handleContainerLayout = useCallback(
        (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
            const { width, height } = event.nativeEvent.layout;
            containerSize$.set(direction === "horizontal" ? width : height);
        },
        [containerSize$, direction],
    );

    const contextValue: PanelContextValue = {
        direction,
        registerPanel,
        unregisterPanel,
        updatePanelSizes,
    };

    return (
        <PanelContext.Provider value={contextValue}>
            <View
                className={cn("flex-1 min-h-0 min-w-0", direction === "horizontal" ? "flex-row" : "flex-col", className)}
                onLayout={handleContainerLayout}
            >
                {children}
            </View>
        </PanelContext.Provider>
    );
}

interface PanelProps {
    children: ReactNode;
    id: string;
    minSize?: number;
    maxSize?: number;
    defaultSize: number;
    order?: number;
    className?: string;
    flex?: boolean;
}

function Panel({ children, id, minSize = 100, maxSize, defaultSize, order = 0, className, flex = false }: PanelProps) {
    const { direction, registerPanel, unregisterPanel } = usePanelContext();
    const size$ = settings$.state.panels[id];
    const size = useValue(size$);

    useMount(() => {
        registerPanel({ id, minSize, maxSize, defaultSize, order }, size$);

        return () => {
            unregisterPanel(id);
        };
    });

    const isHorizontal = direction === "horizontal";
    const style = {
        flexBasis: size,
        flexGrow: flex ? 1 : 0,
        flexShrink: 0,
        ...(isHorizontal
            ? { minWidth: minSize, ...(maxSize !== undefined ? { maxWidth: maxSize } : {}) }
            : { minHeight: minSize, ...(maxSize !== undefined ? { maxHeight: maxSize } : {}) }),
    };

    return (
        <View style={style} className={className}>
            {children}
        </View>
    );
}

interface PanelResizeHandleProps {
    panelId: string;
    className?: string;
    disabled?: boolean;
    hitAreaMargins?: number;
    onDragging?: (isDragging: boolean) => void;
}

export function PanelResizeHandle({
    panelId,
    className,
    disabled = false,
    hitAreaMargins = 15,
    onDragging,
}: PanelResizeHandleProps) {
    const { direction, updatePanelSizes } = usePanelContext();
    const [isDragging, setIsDragging] = useState(false);
    const [panResponder, setPanResponder] = useState<ReturnType<typeof PanResponder.create> | null>(null);
    const lastDeltaRef = useRef(0);
    const panelIdRef = useRefValue(panelId);
    const isVertical = direction === "vertical";

    useEffect(() => {
        setPanResponder(PanResponder.create({
            onStartShouldSetPanResponder: () => !disabled,
            onMoveShouldSetPanResponder: () => !disabled,
            onPanResponderGrant: () => {
                lastDeltaRef.current = 0;
                setIsDragging(true);
                onDragging?.(true);
            },
            onPanResponderMove: (_event: GestureResponderEvent, gestureState: PanResponderGestureState) => {
                if (!disabled) {
                    const currentDelta = direction === "horizontal" ? gestureState.dx : gestureState.dy;
                    const deltaSinceLastUpdate = currentDelta - lastDeltaRef.current;
                    lastDeltaRef.current = currentDelta;

                    if (Math.abs(deltaSinceLastUpdate) > 1) {
                        updatePanelSizes(panelIdRef.current, deltaSinceLastUpdate);
                    }
                }
            },
            onPanResponderRelease: () => {
                lastDeltaRef.current = 0;
                setIsDragging(false);
                onDragging?.(false);
            },
            onPanResponderTerminate: () => {
                lastDeltaRef.current = 0;
                setIsDragging(false);
                onDragging?.(false);
            },
        }));
    }, [direction, disabled, onDragging, panelIdRef, updatePanelSizes]);
    const hitAreaStyle = isVertical
        ? { height: hitAreaMargins, width: "100%" as const }
        : { height: "100%" as const, width: hitAreaMargins };

    return (
        <View
            style={{
                opacity: isDragging ? 0.8 : 1,
                backgroundColor: isDragging ? "rgba(0, 122, 255, 0.6)" : "transparent",
            }}
            className={cn(
                "relative z-10 flex justify-center items-center bg-transparent",
                isVertical ? "h-1 w-full" : "w-1 -m-0.5 h-screen",
                disabled && "pointer-events-none opacity-50",
                className,
            )}
            {...(panResponder?.panHandlers ?? {})}
        >
            <View className={cn("bg-transparent", isVertical ? "h-[1px] w-full" : "w-[1px] h-full")} />
            <View
                className="absolute"
                style={hitAreaStyle}
            />
        </View>
    );
}

export { PanelGroup as Group, Panel, PanelResizeHandle as ResizeHandle };
