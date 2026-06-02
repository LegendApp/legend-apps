import type { Observable } from "@legendapp/state";
import { useRef } from "react";
import { type GestureResponderEvent, PanResponder, type PanResponderGestureState, View } from "react-native";

import { cn } from "@/utils/cn";

interface ResizeHandleProps {
    width$: Observable<number>;
    isVertical?: boolean;
    min: number;
    max: number;
    side: "left" | "right";
    className?: string;
    line?: boolean;
}

export const ResizeHandle = ({ width$, isVertical = false, min, max, side, line, className }: ResizeHandleProps) => {
    // Create PanResponder to handle resize gestures
    const lastDelta = useRef(0);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                lastDelta.current = 0;
            },
            onPanResponderMove: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
                // Calculate the delta from the last position
                const currentDelta = isVertical ? gestureState.dy : gestureState.dx;
                const deltaSinceLastUpdate = currentDelta - lastDelta.current;
                lastDelta.current = currentDelta;

                if (deltaSinceLastUpdate !== 0) {
                    width$.set((prev) =>
                        Math.max(
                            min,
                            Math.min(max, prev + (side === "left" ? -deltaSinceLastUpdate : deltaSinceLastUpdate)),
                        ),
                    );
                }
            },
            onPanResponderRelease: () => {
                lastDelta.current = 0;
            },
        }),
    ).current;

    return (
        <View className={cn("relative height-full z-10", isVertical ? "h-4 w-full" : "w-4 h-full", className)}>
            <View
                className="flex-1 justify-center items-center"
                {...panResponder.panHandlers}
                style={{
                    cursor: (isVertical ? "ns-resize" : "ew-resize") as any,
                }}
            >
                {line && <View className="w-[1px] h-full bg-border-primary" />}
            </View>
        </View>
    );
};
