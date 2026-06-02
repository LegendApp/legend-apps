import type { Observable } from "@legendapp/state";
import type { ReactNode } from "react";
import { View } from "react-native";

import { Checkbox } from "@/components/Checkbox";
import { cn } from "@/utils/cn";

interface WithCheckboxProps {
    checked$?: Observable<boolean>;
    checked?: boolean;
    onCheckedChanged?: (value: boolean) => void;
    children: ReactNode;
    className?: string;
}

/**
 * Utility component that wraps content with an optional checkbox
 */
export function WithCheckbox({ checked$, checked, onCheckedChanged, children, className }: WithCheckboxProps) {
    return (
        <View
            className={cn("flex-row items-center", className)}
            pointerEvents={!checked$ && !onCheckedChanged ? "none" : undefined}
        >
            <Checkbox $checked={checked$} checked={checked} onChange={onCheckedChanged} />
            <View className="ml-2">{children}</View>
        </View>
    );
}
