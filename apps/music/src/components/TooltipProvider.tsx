import { Portal } from "@gorhom/portal";
import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Dimensions, Text, View } from "react-native";

interface TooltipDetails {
    text: string;
    anchorX: number;
    anchorY: number;
    anchorHeight: number;
    placement?: "top" | "bottom";
}

interface TooltipContextValue {
    showTooltip: (details: TooltipDetails) => void;
    hideTooltip: () => void;
}

const TooltipContext = createContext<TooltipContextValue | undefined>(undefined);

export function TooltipProvider({ children }: PropsWithChildren) {
    const [tooltip, setTooltip] = useState<TooltipDetails | null>(null);
    const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 });

    const showTooltip = useCallback((details: TooltipDetails) => {
        setTooltip(details);
    }, []);

    const hideTooltip = useCallback(() => {
        setTooltip(null);
        setTooltipSize({ width: 0, height: 0 });
    }, []);

    const contextValue = useMemo(() => ({ showTooltip, hideTooltip }), [hideTooltip, showTooltip]);

    const verticalOffset = 8;
    const windowWidth = Dimensions.get("window").width;
    const windowHeight = Dimensions.get("window").height;

    let top = tooltip
        ? tooltip.placement === "top"
            ? tooltip.anchorY - tooltipSize.height - verticalOffset
            : tooltip.anchorY + tooltip.anchorHeight + verticalOffset
        : 0;
    let left = tooltip ? tooltip.anchorX - tooltipSize.width / 2 : 0;

    if (tooltip) {
        const maxLeft = windowWidth - tooltipSize.width - verticalOffset;
        left = Math.min(Math.max(left, verticalOffset), maxLeft > 0 ? maxLeft : left);

        const maxTop = windowHeight - tooltipSize.height - verticalOffset;
        top = Math.min(Math.max(top, verticalOffset), maxTop > 0 ? maxTop : top);
    }

    return (
        <TooltipContext.Provider value={contextValue}>
            {children}
            <Portal>
                {tooltip ? (
                    <View pointerEvents="none" className="absolute inset-0">
                        <View pointerEvents="none" style={{ position: "absolute", top, left }}>
                            <View
                                className="bg-background-primary border border-border-primary px-2 py-1 rounded-md shadow-lg"
                                onLayout={({ nativeEvent }) => {
                                    setTooltipSize({
                                        width: nativeEvent.layout.width,
                                        height: nativeEvent.layout.height,
                                    });
                                }}
                            >
                                <Text className="text-text-primary text-xs">{tooltip.text}</Text>
                            </View>
                        </View>
                    </View>
                ) : null}
            </Portal>
        </TooltipContext.Provider>
    );
}

export function useTooltip(): TooltipContextValue {
    const context = useContext(TooltipContext);

    if (!context) {
        if (__DEV__) {
            console.warn("useTooltip called outside of TooltipProvider; falling back to no-op handlers.");
        }

        return {
            showTooltip: () => {},
            hideTooltip: () => {},
        };
    }

    return context;
}
