import type { ReactNode } from "react";
import { Platform, View, type ViewProps } from "react-native";
import type { NativeMouseEvent } from "../types/NativeMouseEvent";
import { SidebarItem as NativeSidebarItemView } from "@legendapp/spark/ui/sidebar";
import { cn } from "@legendapp/spark/ui/classnames";

export interface SidebarItemProps extends ViewProps {
    /** Unique identifier for this item, used for selection */
    itemId: string;
    /** Whether this item can be selected (default: true) */
    selectable?: boolean;
    /** Row height for this item (default: 28) */
    rowHeight?: number;
    onRightClick?: (event: NativeMouseEvent) => void;
    /** Content to render inside the sidebar item */
    children: ReactNode;
}

/**
 * A sidebar item that renders custom RN content inside a native macOS sidebar.
 * Use as a child of NativeSidebar.
 *
 * @example
 * <NativeSidebar selectedId={selected} onSelectionChange={setSelected}>
 *   <SidebarItem itemId="songs">
 *     <Text>Songs</Text>
 *   </SidebarItem>
 *   <SidebarItem itemId="header" selectable={false}>
 *     <View className="flex-row items-center justify-between">
 *       <Text className="font-semibold">Playlists</Text>
 *       <Button icon="plus" onPress={addPlaylist} />
 *     </View>
 *   </SidebarItem>
 * </NativeSidebar>
 */
export function renderNativeSidebarRow({
    itemId,
    selectable = true,
    rowHeight,
    children,
    className,
    style,
    onRightClick,
    ...props
}: SidebarItemProps) {
    const isMacOS = Platform.OS === "macos";
    const handleRightClick = onRightClick
        ? (event: { nativeEvent: NativeMouseEvent }) => {
              onRightClick(event.nativeEvent);
          }
        : undefined;

    if (isMacOS) {
        return (
            <NativeSidebarItemView
                id={itemId}
                selectable={selectable}
                rowHeight={rowHeight}
                style={style}
                onContextMenu={event => onRightClick?.({ x: event.position.x, y: event.position.y, pageX: event.windowPosition.x, pageY: event.windowPosition.y, altKey: event.modifiers.alt, ctrlKey: event.modifiers.control, metaKey: event.modifiers.meta, shiftKey: event.modifiers.shift })}
                {...props}
            >
                {children}
            </NativeSidebarItemView>
        );
    }

    // Fallback for non-macOS platforms
    return (
        <View className={cn("px-3 py-1", className)} style={style} {...props}>
            {children}
        </View>
    );
}

export function SidebarItem(props: SidebarItemProps) { return renderNativeSidebarRow(props); }
