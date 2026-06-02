import type { Observable } from "@legendapp/state";
import { type Animated, ScrollView, View } from "react-native";

import { EffectView } from "@/components/EffectView";
import { SidebarButton } from "@/components/SidebarButton";
import { cn } from "@/utils/cn";

export interface SidebarHeadingT {
    type: "heading";
    id: string;
    heading: string;
}

export interface SidebarItemT {
    type: "item";
    id: string;
    text: string;
}

interface SidebarCommonProps {
    items: { id: string; name: string }[];
    selectedItem$: Observable<string>;
    width?: number | Animated.Value;
    className?: string;
    children?: React.ReactNode;
}

export function Sidebar({ items, selectedItem$, width, className, children }: SidebarCommonProps) {
    const renderItems = () => {
        return items.map((item) => {
            return <SidebarButton key={item.id} text={item.name} value={item.id} selectedItem$={selectedItem$} />;
        });
    };

    const sidebarStyle = width !== undefined ? { width } : { flex: 1 };

    return (
        <View className="h-full" style={sidebarStyle}>
            <EffectView style={{ flex: 1 }} tintColor="#FFFFFF10">
                <View className={cn("flex-1 px-2", className)}>
                    <ScrollView showsVerticalScrollIndicator={false}>{children ?? renderItems()}</ScrollView>
                </View>
            </EffectView>
        </View>
    );
}
