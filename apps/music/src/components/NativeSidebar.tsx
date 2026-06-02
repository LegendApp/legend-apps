import { useObservable, useObserveEffect } from "@legendapp/state/react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { Platform, type StyleProp, View, type ViewStyle } from "react-native";
import { Sidebar as NativeSidebarView, type SidebarItemData } from "@legend-desktop/sidebar";
import { Sidebar } from "@/components/Sidebar";

export type NativeSidebarItem = {
    id: string;
    label: string;
    selectable?: boolean;
};

export interface NativeSidebarProps {
    /** Legacy mode: array of items to render natively */
    items?: NativeSidebarItem[];
    /** Currently selected item ID */
    selectedId?: string;
    /** Callback when selection changes */
    onSelectionChange?: (id: string) => void;
    /** Callback when sidebar layout changes, provides width and height */
    onLayout?: (layout: { width: number; height: number }) => void;
    /** Width of the sidebar (for non-macOS fallback) */
    width?: number;
    /** Top content inset */
    contentInsetTop?: number;
    className?: string;
    style?: StyleProp<ViewStyle>;
    /**
     * Children mode: pass SidebarItem components as children
     * for custom RN content in each row
     */
    children?: ReactNode;
}

export function NativeSidebar({
    items,
    selectedId,
    onSelectionChange,
    onLayout,
    width,
    contentInsetTop,
    className,
    style,
    children,
}: NativeSidebarProps) {
    const isMacOS = Platform.OS === "macos";
    const hasChildren = children !== undefined;

    // Fallback items for non-macOS (legacy mode only)
    const fallbackItems = useMemo(() => {
        if (hasChildren || !items) return [];
        return items.map((item) => ({ id: item.id, name: item.label }));
    }, [items, hasChildren]);
    const nativeItems = useMemo<SidebarItemData[] | undefined>(
        () => items?.map((item) => ({ id: item.id, title: item.label, selectable: item.selectable })),
        [items],
    );

    const selectedItem$ = useObservable<string>(selectedId ?? items?.[0]?.id ?? "");

    useEffect(() => {
        if (!isMacOS && selectedId !== undefined && selectedItem$.get() !== selectedId) {
            selectedItem$.set(selectedId);
        }
    }, [isMacOS, selectedId, selectedItem$]);

    useObserveEffect(selectedItem$, ({ value }) => {
        if (!isMacOS && value !== selectedId) {
            onSelectionChange?.(value ?? "");
        }
    });

    if (isMacOS) {
        // Children mode: RN content in each row
        if (hasChildren) {
            return (
                <NativeSidebarView
                    selectedId={selectedId}
                    contentInsetTop={contentInsetTop}
                    onSidebarSelectionChange={(event) => onSelectionChange?.(event.nativeEvent.id)}
                    onSidebarLayout={onLayout ? (event) => onLayout(event.nativeEvent) : undefined}
                    style={[style, width !== undefined ? { width } : null]}
                    className={className}
                >
                    {children}
                </NativeSidebarView>
            );
        }

        // Legacy mode: native rendering from items array
        return (
            <NativeSidebarView
                items={nativeItems}
                selectedId={selectedId}
                contentInsetTop={contentInsetTop}
                onSidebarSelectionChange={(event) => onSelectionChange?.(event.nativeEvent.id)}
                onSidebarLayout={onLayout ? (event) => onLayout(event.nativeEvent) : undefined}
                style={[style, width !== undefined ? { width } : null]}
                className={className}
            />
        );
    }

    // Non-macOS fallback
    if (hasChildren) {
        return (
            <View style={[{ flex: 1 }, style]} className={className}>
                {children}
            </View>
        );
    }

    return (
        <View style={[{ flex: 1 }, style]}>
            <Sidebar items={fallbackItems} selectedItem$={selectedItem$} width={width} className={className} />
        </View>
    );
}

// Re-export SidebarItem for convenience
export { SidebarItem } from "@/components/SidebarItem";
