import type { ReactNode } from "react";
import { PlatformColor, StyleSheet, Text } from "react-native";

export * from "@legendapp/spark/ui/settings";

export function SettingsCaption({ children }: { children: ReactNode }) {
    return <Text style={styles.caption}>{children}</Text>;
}

export const settingsInputFrame = "h-8 justify-center rounded-md border border-border-primary bg-background-secondary";
export const settingsInputText = "px-2 text-text-primary";

const styles = StyleSheet.create({
    caption: {
        color: PlatformColor("secondaryLabelColor"),
        fontSize: 11,
        lineHeight: 14,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    input: { fontSize: 13, paddingVertical: 0 },
});

export const settingsInputStyle = styles.input;
