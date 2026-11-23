import { Button } from "@legendapp/spark/ui";
import type { ReactNode } from "react";
import { PlatformColor, StyleSheet, Text } from "react-native";
import { SettingsRow } from "@legendapp/spark/ui/settings";

export * from "@legendapp/spark/ui/settings";

export function SettingsCaption({ children }: { children: ReactNode }) {
    return <Text style={styles.caption}>{children}</Text>;
}

/** One status row per service: connecting turns the service on, disconnecting turns it off. */
export function SettingsConnectionRow({
    connected,
    description,
    disabled,
    label,
    onConnect,
    onDisconnect,
}: {
    connected: boolean;
    description?: string;
    disabled?: boolean;
    label: string;
    onConnect: () => void;
    onDisconnect: () => void;
}) {
    return (
        <SettingsRow label={label} description={description}>
            <Button disabled={disabled} onPress={connected ? onDisconnect : onConnect}>
                {connected ? "Disconnect" : "Connect"}
            </Button>
        </SettingsRow>
    );
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
