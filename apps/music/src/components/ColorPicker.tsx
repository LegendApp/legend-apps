import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { Text, TextInput, View } from "react-native";

import { cn } from "@/utils/cn";

export interface ColorPickerProps {
    label: string;
    $color: Observable<string>;
    className?: string;
}

export function ColorPicker({ label, $color, className }: ColorPickerProps) {
    const color = useValue($color);

    const handleChange = (value: string) => {
        $color.set(value.trim());
    };

    return (
        <View className={cn("mb-4", className)}>
            <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-medium text-text-secondary">{label}</Text>
                <View
                    className="h-5 w-5 rounded border border-border-primary"
                    style={{ backgroundColor: color || "transparent" }}
                />
            </View>
            <TextInput
                value={color}
                onChangeText={handleChange}
                placeholder="#FFFFFF"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-text-primary"
            />
        </View>
    );
}
