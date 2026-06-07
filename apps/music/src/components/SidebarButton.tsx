import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { Text, View } from "react-native";
import type { NativeMouseEvent } from "@/types/NativeMouseEvent";

import { state$ } from "@/systems/State";
import { cn } from "@legend-desktop/classnames";
import { Button } from "./Button";

export interface SidebarButtonProps {
    text: string;
    value: string;
    selectedItem$: Observable<string>;
    indentLevel?: number;
}

export function SidebarButton({ text, value, selectedItem$, indentLevel = 0 }: SidebarButtonProps) {
    const isSelected = useValue(() => selectedItem$.get() === value);
    const textColor = isSelected ? "text-text-primary" : "text-text-secondary";
    const indentPadding = 8 + indentLevel * 12;
    const isDropdownOpen = useValue(state$.isDropdownOpen);

    return (
        <Button
            className={cn(
                "py-2 rounded-md mx-1 my-0.5",
                isSelected && "bg-white/10",
                !isSelected && !isDropdownOpen && "hover:bg-white/10",
            )}
            onClick={(e: NativeMouseEvent) => {
                if (e.button === 2) {
                    console.log("right click");
                    // Right click handled - no need to set selection
                } else {
                    selectedItem$.set(value);
                }
            }}
        >
            <View className="flex-row items-center" style={{ paddingLeft: indentPadding }}>
                <Text className={cn("text-sm", textColor, isSelected && "font-medium")}>{text}</Text>
            </View>
        </Button>
    );
}
