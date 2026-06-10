import { useValue } from "@legendapp/state/react";
import { applyLegendThemeToUniwind, getLegendTheme, type LegendThemeBackground } from "@legend-desktop/theme";
import { useEffect, type ReactNode } from "react";
import { Image, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { GlassEffectView } from "@legend-desktop/glass-effect-view";
import {
    defaultMusicBackground,
    ensureMusicAppearanceSettings,
    normalizeMusicAppearanceSettings,
    settings$,
} from "@/systems/Settings";

type MusicBackgroundProps = {
    children: ReactNode;
    onLayout?: (event: LayoutChangeEvent) => void;
};

function isDefaultBackground(background: LegendThemeBackground) {
    return JSON.stringify(background) === JSON.stringify(defaultMusicBackground);
}

function normalizeImageUri(path: string) {
    if (path.startsWith("file://")) {
        return path;
    }
    return path.startsWith("/") ? `file://${path}` : path;
}

export function MusicBackground({ children, onLayout }: MusicBackgroundProps) {
    const appearance = useValue(settings$.appearance);
    const normalizedAppearance = normalizeMusicAppearanceSettings(appearance);
    const themeName = normalizedAppearance.theme;
    const theme = getLegendTheme(themeName);
    const configuredBackground = normalizedAppearance.background;
    const background = theme.background && isDefaultBackground(configuredBackground)
        ? theme.background
        : configuredBackground;
    const source = background.source;
    const rootBackgroundColor = source.type === "color" ? source.color : theme.colors.windowBackground;

    useEffect(() => {
        ensureMusicAppearanceSettings();
    }, []);

    useEffect(() => {
        applyLegendThemeToUniwind(themeName);
    }, [themeName]);

    return (
        <View style={[styles.root, { backgroundColor: rootBackgroundColor }]} onLayout={onLayout}>
            {background.glassEnabled ? (
                <GlassEffectView glassStyle="regular" tintColor="transparent" style={StyleSheet.absoluteFill} />
            ) : null}
            {source.type === "image" && source.imagePath.length > 0 ? (
                <Image
                    resizeMode="cover"
                    source={{ uri: normalizeImageUri(source.imagePath) }}
                    style={[styles.media, { opacity: background.opacity }]}
                />
            ) : null}
            {source.type === "color" ? (
                <View style={[styles.media, { backgroundColor: source.color, opacity: background.opacity }]} />
            ) : null}
            {background.tint.enabled ? (
                <View pointerEvents="none" style={[styles.media, { backgroundColor: background.tint.color }]} />
            ) : null}
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
