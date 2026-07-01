import { useValue } from "@legendapp/state/react";
import { useEffect } from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { SettingsPage, SettingsRow, SettingsSection } from "@/settings/components";
import {
    defaultMusicAppearance,
    ensureMusicAppearanceSettings,
    normalizeMusicAppearanceSettings,
    settings$,
} from "@/systems/Settings";
import { themeState$, useTheme } from "@/theme/ThemeProvider";
import { getMusicTheme, musicThemeOptions, type MusicThemeName } from "@/theme/musicThemes";
import { cn } from "@legend-desktop/classnames";

function applyMusicTheme(themeName: MusicThemeName) {
    const theme = getMusicTheme(themeName);
    settings$.appearance.theme.set(theme.name);
    themeState$.customColors.dark.set(JSON.parse(JSON.stringify(theme.colors)));
}

export const ThemeSettings = () => {
    return (
        <SettingsPage>
            <ThemeSettingsContent />
        </SettingsPage>
    );
};

export function ThemeSettingsContent() {
    const { resetTheme } = useTheme();
    const appearance = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const selectedTheme = appearance.theme;
    const background = appearance.background;

    useEffect(() => {
        ensureMusicAppearanceSettings();
    }, []);

    const handleReset = () => {
        resetTheme();
        settings$.appearance.set(defaultMusicAppearance);
        themeState$.customColors.dark.set(
            JSON.parse(JSON.stringify(getMusicTheme(defaultMusicAppearance.theme).colors)),
        );
    };

    return (
        <>
            <SettingsSection
                card={false}
                contentClassName="gap-3"
                first
                headerRight={(
                    <Button onClick={handleReset} variant="secondary" className="px-3 py-1.5 h-auto">
                        <Text className="text-sm text-text-primary">Reset</Text>
                    </Button>
                )}
                title="Theme"
            >
                <View accessibilityRole="radiogroup" className="gap-2">
                    {musicThemeOptions.map((theme) => {
                        const isSelected = selectedTheme === theme.value;
                        return (
                            <Button
                                key={theme.value}
                                className={cn(
                                    "h-9 justify-center rounded-md border px-3",
                                    isSelected
                                        ? "border-accent-primary bg-background-tertiary"
                                        : "border-border-primary bg-background-secondary",
                                )}
                                onClick={() => applyMusicTheme(theme.value)}
                            >
                                <Text className="text-sm font-medium text-text-primary">{theme.label}</Text>
                            </Button>
                        );
                    })}
                </View>
            </SettingsSection>

            <SettingsSection card={false} className="mt-6" contentClassName="gap-3" title="Background">
                <SettingsRow
                    title="Liquid Glass"
                    description="Use the native translucent glass background."
                    control={<Checkbox $checked={settings$.appearance.background.glassEnabled} />}
                />
                <SettingsRow
                    title="Background Color"
                    description="Supports alpha, for example #00000044 or rgba(0, 0, 0, 0.27)."
                    align="center"
                    control={
                        <View className="w-44">
                            <View className="mb-2 flex-row items-center justify-end gap-2">
                                <View
                                    className="h-5 w-5 rounded border border-border-primary"
                                    style={{ backgroundColor: background.color || "transparent" }}
                                />
                            </View>
                            <TextInput
                                value={background.color}
                                onChangeText={(value) => settings$.appearance.background.color.set(value.trim())}
                                placeholder="#00000044"
                                autoCapitalize="none"
                                autoCorrect={false}
                                className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-text-primary"
                            />
                        </View>
                    }
                />
            </SettingsSection>

        </>
    );
}
