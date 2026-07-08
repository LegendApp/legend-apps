import { useValue } from "@legendapp/state/react";
import { useEffect, type ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import {
    ensureMusicAppearanceSettings,
    normalizeMusicAppearanceSettings,
    settings$,
} from "../systems/Settings";
import { getMusicTheme } from "../theme/musicThemes";

type MusicBackgroundProps = {
    children: ReactNode;
    onLayout?: (event: LayoutChangeEvent) => void;
};

export function MusicBackground({ children, onLayout }: MusicBackgroundProps) {
    const appearance = useValue(settings$.appearance);
    const normalizedAppearance = normalizeMusicAppearanceSettings(appearance);
    const themeName = normalizedAppearance.theme;
    const theme = getMusicTheme(themeName);
    const background = normalizedAppearance.background;
    const rootBackgroundColor = background.glassEnabled ? "transparent" : theme.windowBackground;

    useEffect(() => {
        ensureMusicAppearanceSettings();
    }, []);

    return (
        <View style={[styles.root, { backgroundColor: rootBackgroundColor }]} onLayout={onLayout}>
            <View
                pointerEvents="none"
                style={[styles.media, { backgroundColor: background.color }]}
            />
            <View style={styles.content}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    media: {
        ...StyleSheet.absoluteFillObject,
    },
    root: {
        flex: 1,
        overflow: "hidden",
    },
});
