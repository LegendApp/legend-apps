import { isString } from "@legendapp/state";
import { useMount } from "@legendapp/state/react";
import { type PropsWithChildren, useRef } from "react";
import { type GestureResponderEvent, Pressable, type PressableProps, Text } from "react-native";
import { Icon } from "../systems/Icon";
import { startNavMeasurement } from "../systems/NavTime";
import type { NativeMouseEvent } from "../types/NativeMouseEvent";
import type { SFSymbols } from "../types/SFSymbols";
import { cn } from "@legend-apps/classnames";
import { useTooltip } from "./TooltipProvider";

const DOUBLE_CLICK_DURATION = 300;
const DOUBLE_CLICK_DISTANCE = 4;

export interface ButtonProps
    extends Omit<PressableProps, "onPress" | "onPressIn" | "onPressOut" | "onClick" | "onMouseDown" | "onMouseUp"> {
    className?: string;
    icon?: SFSymbols;
    variant?: "icon-hover" | "icon" | "icon-bg" | "primary" | "secondary" | "accent" | "destructive" | "inverse";
    size?: "xs" | "small" | "medium" | "large";
    iconSize?: number;
    iconYOffset?: number;
    tooltip?: string;
    active?: boolean;
    onClick?: (event: NativeMouseEvent) => void;
    onMouseDown?: (event: NativeMouseEvent) => void;
    onMouseUp?: (event: NativeMouseEvent) => void;
    onDoubleClick?: (event: NativeMouseEvent) => void;
    onRightClick?: (event: NativeMouseEvent) => void;
}

export function Button({
    children,
    className,
    icon,
    variant,
    size,
    iconSize: iconSizeProp,
    iconYOffset,
    active,
    onClick,
    onMouseDown,
    onMouseUp,
    onDoubleClick,
    onRightClick,
    tooltip,
    ...props
}: PropsWithChildren<ButtonProps>) {
    const { showTooltip, hideTooltip } = useTooltip();
    const pressableRef = useRef<any>(null);
    const lastClickRef = useRef<{ time: number; x: number; y: number } | null>(null);
    const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const pressableAccessibilityLabel = props.accessibilityLabel;
    const { onHoverIn, onHoverOut, ...restPressableProps } = props;
    const tooltipText =
        tooltip ?? (typeof pressableAccessibilityLabel === "string" ? pressableAccessibilityLabel : undefined);

    const clearTooltipTimeout = () => {
        if (tooltipTimeoutRef.current) {
            clearTimeout(tooltipTimeoutRef.current);
            tooltipTimeoutRef.current = null;
        }
    };

    useMount(() => () => clearTooltipTimeout());

    const handleClick = (event: GestureResponderEvent) => {
        const nativeEvent = event.nativeEvent as unknown as NativeMouseEvent;

        if (nativeEvent?.button !== undefined && nativeEvent.button !== 0) {
            // Only handle left mouse button clicks
            return;
        }

        const now = Date.now();
        const currentX = nativeEvent?.pageX ?? nativeEvent?.clientX ?? nativeEvent?.x ?? 0;
        const currentY = nativeEvent?.pageY ?? nativeEvent?.clientY ?? nativeEvent?.y ?? 0;
        const previous = lastClickRef.current;
        const isDoubleClick =
            previous !== null &&
            now - previous.time <= DOUBLE_CLICK_DURATION &&
            Math.hypot(previous.x - currentX, previous.y - currentY) <= DOUBLE_CLICK_DISTANCE;

        lastClickRef.current = { time: now, x: currentX, y: currentY };

        if (isDoubleClick && onDoubleClick) {
            onDoubleClick(nativeEvent);
            return;
        }

        startNavMeasurement();
        onClick?.(nativeEvent);
    };

    const handleMouseDown = (event: GestureResponderEvent) => {
        const nativeEvent = event.nativeEvent as unknown as NativeMouseEvent;
        clearTooltipTimeout();
        hideTooltip();

        if (nativeEvent?.button === 2 || nativeEvent.ctrlKey) {
            onRightClick?.(nativeEvent);
        } else {
            onMouseDown?.(nativeEvent);
        }
    };

    const handleMouseUp = (event: GestureResponderEvent) => {
        const nativeEvent = event.nativeEvent as unknown as NativeMouseEvent;

        onMouseUp?.(nativeEvent);
    };

    const handleHoverIn = (event: any) => {
        onHoverIn?.(event);

        if (!tooltipText || restPressableProps.disabled) {
            return;
        }

        clearTooltipTimeout();

        tooltipTimeoutRef.current = setTimeout(() => {
            const target = pressableRef.current;

            if (target?.measureInWindow) {
                target.measureInWindow((x: number, y: number, width: number, height: number) => {
                    showTooltip({
                        text: tooltipText,
                        anchorX: x + width / 2,
                        anchorY: y,
                        anchorHeight: height,
                        placement: "bottom",
                    });
                });
            }
        }, 1000);
    };

    const handleHoverOut = (event: any) => {
        onHoverOut?.(event);
        clearTooltipTimeout();
        hideTooltip();
    };

    const iconSize = iconSizeProp ?? (size === "small" ? 14 : size === "large" ? 24 : 18);
    const isIcon = variant === "icon" || variant === "icon-bg" || variant === "icon-hover";

    return (
        <Pressable
            {...restPressableProps}
            ref={pressableRef}
            className={cn(
                icon && children && "flex-row items-center gap-x-2",
                icon && !children && "items-center justify-center",
                icon && !children && active && "text-blue-500",
                size === "xs" && isIcon && "size-6",
                size === "small" && isIcon && "size-7",
                size === "medium" && isIcon && "size-9",
                size === "large" && isIcon && "p-4",
                variant === "icon" && "rounded-md hover:bg-white/10",
                variant === "icon-hover" && "opacity-25 hover:opacity-100",
                variant === "icon-bg" &&
                    "rounded-md bg-background-secondary border border-border-primary hover:bg-white/10",
                size === "small" && !isIcon && "h-7 px-2 justify-center items-center",
                size === "medium" && !isIcon && "h-9 px-3 justify-center items-center",
                size === "large" && !isIcon && "h-11 px-4 justify-center items-center",
                variant === "primary" && "rounded-md bg-white/15 hover:bg-white/20 transition-colors duration-300",
                variant === "accent" && "rounded-md bg-accent-primary",
                variant === "secondary" && "rounded-md bg-background-secondary",
                variant === "destructive" && "rounded-md bg-background-destructive",
                className,
            )}
            onPress={handleClick}
            onPressIn={handleMouseDown}
            onPressOut={handleMouseUp}
            onHoverIn={handleHoverIn}
            onHoverOut={handleHoverOut}
        >
            {icon && <Icon name={icon} size={iconSize} yOffset={iconYOffset} />}
            {isString(children) ? <Text className="text-white text-base">{children}</Text> : children}
        </Pressable>
    );
}
