import { useValue } from "@legendapp/state/react";
import { useEffect } from "react";
import { PlatformColor, Pressable, Text, TextInput, View } from "react-native";
import { settingsInputFrame, settingsInputStyle, settingsInputText, SettingsRow, SettingsSection, SettingsSwitchRow } from "./components";
import { ensureMusicAppearanceSettings, normalizeMusicAppearanceSettings, settings$ } from "../systems/Settings";
import { musicThemeOptions, musicThemes, type MusicTheme } from "../theme/musicThemes";

function ThemePreview({ colors }: { colors: MusicTheme["colors"] }) {
    return (
        <View className="flex-1" style={{ backgroundColor: colors.background.primary }}>
            <View className="h-2.5 flex-row items-center gap-0.5 px-1.5" style={{ backgroundColor: colors.background.tertiary }}>
                {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
                    <View key={color} className="h-0.5 w-0.5 rounded-full" style={{ backgroundColor: color }} />
                ))}
            </View>
            <View className="flex-1 flex-row">
                <View className="w-1/3" style={{ backgroundColor: colors.background.secondary }} />
                <View className="flex-1 gap-1 p-1.5">
                    <View className="h-1 w-3/4 rounded-sm" style={{ backgroundColor: colors.accent.primary }} />
                    <View className="h-1 rounded-sm" style={{ backgroundColor: colors.border.primary }} />
                    <View className="h-1 rounded-sm" style={{ backgroundColor: colors.border.primary }} />
                </View>
            </View>
        </View>
    );
}

export function ThemeSettingsContent() {
    const { theme: selectedTheme, background } = normalizeMusicAppearanceSettings(useValue(settings$.appearance));

    useEffect(() => {
        ensureMusicAppearanceSettings();
    }, []);

    return (
        <>
            <SettingsSection>
                <SettingsRow label="Theme">
                    <View accessibilityRole="radiogroup" className="flex-row items-center gap-3">
                        {musicThemeOptions.map(({ label, value }) => {
                            const selected = selectedTheme === value;
                            return (
                                <Pressable
                                    key={value}
                                    accessibilityLabel={label}
                                    accessibilityRole="radio"
                                    accessibilityState={{ checked: selected }}
                                    onPress={() => settings$.appearance.theme.set(value)}
                                    className="w-20 shrink items-center gap-1"
                                >
                                    <View
                                        className="w-full rounded-lg border-2 p-0.5"
                                        style={{ borderColor: selected ? PlatformColor("controlAccentColor") : "transparent" }}
                                    >
                                        <View className="h-10 flex-row overflow-hidden rounded border" style={{ borderColor: PlatformColor("separatorColor") }}>
                                            {value !== "dark" && <ThemePreview colors={musicThemes.light.colors} />}
                                            {value !== "light" && <ThemePreview colors={musicThemes.dark.colors} />}
                                        </View>
                                    </View>
                                    <Text style={{ color: PlatformColor(selected ? "labelColor" : "secondaryLabelColor"), fontSize: 11, lineHeight: 14 }}>
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Background">
                <SettingsSwitchRow
                    label="Liquid Glass"
                    description="Use the native translucent glass background."
                    value={background.glassEnabled}
                    onValueChange={(value) => settings$.appearance.background.glassEnabled.set(value)}
                />
                <SettingsRow
                    label="Background Color"
                    description="Supports alpha, for example #00000044 or rgba(0, 0, 0, 0.27)."
                >
                    <View className="w-44 flex-row items-center gap-2">
                        <View
                            className="h-5 w-5 rounded border border-border-primary"
                            style={{ backgroundColor: background.color }}
                        />
                        <View className={`${settingsInputFrame} flex-1`}>
                            <TextInput
                                accessibilityLabel="Background Color"
                                value={background.color}
                                onChangeText={(value) => settings$.appearance.background.color.set(value.trim())}
                                placeholder="#00000044"
                                autoCapitalize="none"
                                autoCorrect={false}
                                className={settingsInputText}
                                style={settingsInputStyle}
                            />
                        </View>
                    </View>
                </SettingsRow>
            </SettingsSection>
        </>
    );
}
