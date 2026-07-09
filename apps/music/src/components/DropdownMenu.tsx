import type { Observable } from "@legendapp/state";
import { useMount, useObservable, useObserveEffect, useValue } from "@legendapp/state/react";
import type { ReactNode } from "react";
import {
    cloneElement,
    createContext,
    forwardRef,
    isValidElement,
    useCallback,
    useContext,
    useId,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "../systems/Icon";
import { state$ } from "../systems/State";
import type { NativeMouseEvent } from "../types/NativeMouseEvent";
import { cn } from "@legend-apps/classnames";
import { Button } from "./Button";

// Context for sharing dropdown state
interface DropdownContextValue {
    isOpen$: Observable<boolean>;
    triggerRef: React.RefObject<View | null>;
    close: () => void;
    onSelect?: (value: string) => void;
    closeOnSelect?: boolean;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

// Context for submenu state
interface SubmenuContextValue {
    parentRef: React.RefObject<View | null> | null;
    level: number;
    submenuId?: string;
}

const SubmenuContext = createContext<SubmenuContextValue>({
    parentRef: null,
    level: 0,
});

function useDropdownContext() {
    const context = useContext(DropdownContext);
    if (!context) {
        throw new Error("Dropdown components must be used within DropdownMenu.Root");
    }
    return context;
}

// Export type for the ref
export interface DropdownMenuRootRef {
    open: () => void;
}

// Root component
interface RootProps {
    children: ReactNode;
    isOpen$?: Observable<boolean>;
    onSelect?: (value: string) => void;
    closeOnSelect?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const Root = forwardRef<DropdownMenuRootRef, RootProps>(function Root(
    { children, isOpen$: isOpen$Prop, onSelect, closeOnSelect = true, onOpenChange },
    ref,
) {
    const fallbackIsOpen$ = useObservable(false);
    const isOpen$ = isOpen$Prop ?? fallbackIsOpen$;
    const openedWithMouseDown$ = useObservable(false);
    const triggerRef = useRef<View>(null);

    const close = useCallback(() => {
        setTimeout(() => {
            isOpen$.set(false);
            openedWithMouseDown$.set(false);
            state$.isDropdownOpen.set(false);
        }, 60);
        onOpenChange?.(false);
    }, [isOpen$, onOpenChange, openedWithMouseDown$]);

    const open = useCallback(() => {
        isOpen$.set(true);
        onOpenChange?.(true);
    }, [isOpen$, onOpenChange]);

    useImperativeHandle(
        ref,
        () => ({
            open,
        }),
        [open],
    );

    useObserveEffect(isOpen$, (e) => {
        if (e.previous !== undefined) {
            const value = !!e.value;
            state$.isDropdownOpen.set(value);
            onOpenChange?.(value);
            if (!value) {
                openedWithMouseDown$.set(false);
            }
        }
    });

    const contextValue: DropdownContextValue = {
        isOpen$,
        triggerRef,
        close,
        onSelect,
        closeOnSelect,
    };

    return <DropdownContext.Provider value={contextValue}>{children}</DropdownContext.Provider>;
});

// Trigger component
interface TriggerProps {
    children: ReactNode;
    className?: string;
    asChild?: boolean;
    unstyled?: boolean;
    showCaret?: boolean;
    caretPosition?: "right" | "left";
    textClassName?: string;
    disabled?: boolean;
}

function Trigger({
    children,
    className,
    asChild = false,
    unstyled = false,
    showCaret = false,
    caretPosition = "right",
    textClassName,
    disabled = false,
}: TriggerProps) {
    const { isOpen$, triggerRef } = useDropdownContext();

    const onMouseDown = useCallback(() => {
        if (disabled) {
            return;
        }
        if (!isOpen$.get()) {
            isOpen$.set(true);
        }
    }, [disabled, isOpen$]);

    if (asChild) {
        // Clone the child element and pass our props to it
        if (isValidElement(children)) {
            return (
                <View ref={triggerRef}>
                    {cloneElement(children, {
                        onMouseDown,
                        ...(disabled ? { disabled: true } : {}),
                        ...(children.props as any),
                    })}
                </View>
            );
        }
        // Fallback if children is not a valid element
        return (
            <View ref={triggerRef}>
                <Button onMouseDown={onMouseDown}>{children}</Button>
            </View>
        );
    }

    if (unstyled || showCaret) {
        // Custom styled trigger with optional caret
        const caret = showCaret ? (
            <View style={{ marginTop: -6 }}>
                <Icon name="chevron.up.chevron.down" size={14} />
            </View>
        ) : null;
        return (
            <View ref={triggerRef}>
                <Button
                    className={cn("flex-row items-center group", className)}
                    onMouseDown={onMouseDown}
                    disabled={disabled}
                >
                    {caretPosition === "left" && caret}
                    <View className={cn("flex-1", textClassName)}>{children}</View>
                    {caretPosition === "right" && caret}
                </Button>
            </View>
        );
    }

    return (
        <View ref={triggerRef}>
            <Button className={className} onMouseDown={onMouseDown} disabled={disabled}>
                {children}
            </Button>
        </View>
    );
}

// Content component
interface ContentProps {
    children: ReactNode;
    className?: string;
    maxHeightClassName?: string;
    scrolls?: boolean;
    directionalHint?:
        | "bottonLeftEdge"
        | "bottomCenter"
        | "bottomRightEdge"
        | "topLeftEdge"
        | "topCenter"
        | "topRightEdge";
    setInitialFocus?: boolean;
    variant?: "default" | "unstyled";
    anchorRect?: {
        screenX: number;
        screenY: number;
        width: number;
        height: number;
    };
    minWidth?: number;
    maxWidth?: number;
}

function Content({
    children,
    className = "",
    maxHeightClassName,
    scrolls = true,
    directionalHint = "bottonLeftEdge",
    variant = "default",
    setInitialFocus = false,
    anchorRect,
    minWidth = 400,
    maxWidth,
}: ContentProps) {
    const contextValue = useDropdownContext();
    const { isOpen$, triggerRef, close } = contextValue;
    const isOpen = useValue(isOpen$);

    if (!isOpen) {
        return null;
    }

    const contentStyle = [
        styles.callout,
        {
            left: anchorRect?.screenX ?? 8,
            maxWidth,
            minWidth,
            top: anchorRect ? anchorRect.screenY + anchorRect.height + 4 : 32,
        },
    ];

    return (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <Pressable accessibilityLabel="Close menu" onPress={close} style={StyleSheet.absoluteFill} />
            <View style={contentStyle}>
                <DropdownContext.Provider value={contextValue}>
                    <SubmenuContext.Provider
                        value={{
                            parentRef: triggerRef,
                            level: 0,
                        }}
                    >
                        {scrolls ? (
                            <ScrollView
                                className={cn("rounded border border-border-popup", maxHeightClassName, className)}
                                contentContainerClassName={variant === "default" ? "p-1" : ""}
                                scrollEnabled={!!maxHeightClassName}
                            >
                                {children}
                            </ScrollView>
                        ) : variant === "default" ? (
                            <View className={cn("rounded border border-border-popup", maxHeightClassName, className)}>
                                <View className="p-1">{children}</View>
                            </View>
                        ) : (
                            children
                        )}
                    </SubmenuContext.Provider>
                </DropdownContext.Provider>
            </View>
        </View>
    );
}

// Label component
interface LabelProps {
    children: ReactNode;
    className?: string;
}

function Label({ children, className = "" }: LabelProps) {
    return <Text className={cn("px-3 py-2 text-text-secondary text-sm font-medium", className)}>{children}</Text>;
}

// Item component
interface ItemProps {
    children: ReactNode;
    onSelect?: (event: NativeMouseEvent) => void;
    value?: string;
    className?: string;
    disabled?: boolean;
    variant?: "default" | "unstyled";
}

function Item({ children, onSelect, value, className = "", disabled = false, variant = "default" }: ItemProps) {
    const { close, onSelect: contextOnSelect, closeOnSelect } = useDropdownContext();

    const handlePress = useCallback(
        (event: NativeMouseEvent) => {
            if (disabled) return;

            if (onSelect) {
                onSelect(event);
            } else if (value && contextOnSelect) {
                contextOnSelect(value);
            }

            if (closeOnSelect) {
                close();
            }
        },
        [onSelect, value, contextOnSelect, closeOnSelect, close, disabled],
    );

    return (
        <Button
            className={cn(
                variant === "default" ? "px-3 rounded-md hover:bg-white/10 flex-row items-center" : "",
                disabled && "opacity-50",
                className,
            )}
            onClick={handlePress}
            disabled={disabled}
        >
            {children}
        </Button>
    );
}

// ItemTitle component
interface ItemTitleProps {
    children: ReactNode;
    className?: string;
}

function ItemTitle({ children, className = "" }: ItemTitleProps) {
    return <Text className={cn("text-text-primary flex-1", className)}>{children}</Text>;
}

// CheckboxItem component
interface CheckboxItemProps {
    children: ReactNode;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    value?: string;
    className?: string;
}

function CheckboxItem({ children, checked = false, onCheckedChange, value, className = "" }: CheckboxItemProps) {
    const { close, onSelect: contextOnSelect, closeOnSelect } = useDropdownContext();

    const handlePress = useCallback(() => {
        const newChecked = !checked;
        onCheckedChange?.(newChecked);

        if (value && contextOnSelect) {
            contextOnSelect(value);
        }

        if (closeOnSelect) {
            close();
        }
    }, [checked, onCheckedChange, value, contextOnSelect, closeOnSelect, close]);

    return (
        <Button
            className={cn("py-2 px-3 rounded-md hover:bg-white/10 flex-row items-center", className)}
            onClick={handlePress}
        >
            {children}
        </Button>
    );
}

// ItemIndicator component
interface ItemIndicatorProps {
    children?: ReactNode;
    className?: string;
}

function ItemIndicator({ children = "✓", className = "" }: ItemIndicatorProps) {
    return <Text className={cn("text-text-primary mr-2", className)}>{children}</Text>;
}

// Sub component
interface SubProps {
    children: ReactNode;
    className?: string;
}

function Sub({ children, className = "" }: SubProps) {
    const submenuId = useId();
    const [isOpen, setIsOpen] = useState(false);
    const { level } = useContext(SubmenuContext);
    const subRef = useRef<View>(null);

    useObserveEffect(() => {
        const activeSubmenuId = state$.activeSubmenuId.get();
        if (activeSubmenuId !== null && activeSubmenuId !== submenuId && isOpen) {
            setIsOpen(false);
        }
    });

    useMount(() => {
        const unsubscribe = state$.isDropdownOpen.onChange(() => {
            if (!state$.isDropdownOpen.get()) {
                setIsOpen(false);
                state$.activeSubmenuId.set(null);
            }
        });

        return () => unsubscribe();
    });

    return (
        <SubmenuContext.Provider
            value={{
                parentRef: subRef,
                level: level + 1,
                submenuId,
            }}
        >
            <View ref={subRef} className={className}>
                {children}
            </View>
        </SubmenuContext.Provider>
    );
}

// SubTrigger component
interface SubTriggerProps {
    children: ReactNode;
    className?: string;
}

function SubTrigger({ children, className = "" }: SubTriggerProps) {
    const { submenuId } = useContext(SubmenuContext);

    const onHoverIn = useCallback(() => {
        if (submenuId) {
            state$.activeSubmenuId.set(submenuId);
        }
    }, [submenuId]);

    return (
        <Button
            className={cn("p-2 rounded-lg hover:bg-white/10 flex-row justify-between items-center", className)}
            onHoverIn={onHoverIn}
        >
            {children}
            <Text className="text-text-tertiary ml-2">▶</Text>
        </Button>
    );
}

// SubContent component
interface SubContentProps {
    children: ReactNode;
    className?: string;
    maxHeightClassName?: `max-h-${number}`;
    directionalHint?:
        | "rightTopEdge"
        | "rightCenter"
        | "rightBottomEdge"
        | "leftTopEdge"
        | "leftCenter"
        | "leftBottomEdge";
}

function SubContent({
    children,
    className = "",
    maxHeightClassName,
    directionalHint = "rightTopEdge",
}: SubContentProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { parentRef, submenuId } = useContext(SubmenuContext);
    const contextValue = useDropdownContext();

    useObserveEffect(() => {
        const activeSubmenuId = state$.activeSubmenuId.get();
        setIsOpen(activeSubmenuId === submenuId);
    });

    if (!isOpen || !parentRef) {
        return null;
    }

    return (
        <View style={styles.subCallout}>
            <DropdownContext.Provider value={contextValue}>
                <ScrollView
                    className={cn("rounded border border-border-popup", maxHeightClassName, className)}
                    contentContainerClassName="p-1"
                    scrollEnabled={!!maxHeightClassName}
                >
                    {children}
                </ScrollView>
            </DropdownContext.Provider>
        </View>
    );
}

// Separator component
interface SeparatorProps {
    className?: string;
}

function Separator({ className = "" }: SeparatorProps) {
    return <View className={cn("h-[1px] bg-border-popup my-1 -mx-1", className)} />;
}

// Arrow component (placeholder for now)
interface ArrowProps {
    className?: string;
}

function Arrow({ className: _className }: ArrowProps) {
    // This would typically be a visual arrow pointing to the trigger
    return null;
}

// Export the compound component
export const DropdownMenu = {
    Root,
    Trigger,
    Content,
    Label,
    Item,
    ItemTitle,
    CheckboxItem,
    ItemIndicator,
    Sub,
    SubTrigger,
    SubContent,
    Separator,
    Arrow,
};

const styles = StyleSheet.create({
    callout: {
        position: "absolute",
        zIndex: 1000,
    },
    subCallout: {
        left: "100%",
        minWidth: 400,
        position: "absolute",
        top: 0,
        zIndex: 1001,
    },
});
