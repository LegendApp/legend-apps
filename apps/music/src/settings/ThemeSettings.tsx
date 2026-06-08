import { BackgroundSettingsSection, ThemeSelectorSection } from "@legend-desktop/appearance-settings";
import { useValue } from "@legendapp/state/react";
import { openFileDialog } from "@legend-desktop/file-dialog";
import { getLegendTheme, getLegendThemeFiles } from "@legend-desktop/theme";
import { useEffect, useMemo } from "react";
import { Text } from "react-native";
import { Button } from "@/components/Button";
import { ColorPicker } from "@/components/ColorPicker";
import { SettingsPage, SettingsSection } from "@/settings/components";
import {
    defaultMusicAppearance,
    defaultMusicBackground,
    ensureMusicAppearanceSettings,
    normalizeMusicAppearanceSettings,
    settings$,
} from "@/systems/Settings";
import { themeState$, useTheme } from "@/theme/ThemeProvider";
import { loadMusicUserThemesSync } from "@/userThemes";

function setMusicTheme(themeName: string) {
    const theme = getLegendTheme(themeName);
    settings$.appearance.set({
        background: theme.background ?? defaultMusicBackground,
        theme: themeName,
    });
}

export const ThemeSettings = () => {
    const { resetTheme } = useTheme();
    const userThemeLoadResult = useMemo(() => loadMusicUserThemesSync({ force: true }), []);
    const themeOptions = useMemo(
        () => getLegendThemeFiles().map((theme) => ({ label: theme.name, value: theme.name })),
        [userThemeLoadResult],
    );
    const appearance = normalizeMusicAppearanceSettings(useValue(settings$.appearance));
    const colors$ = themeState$.customColors.dark;
    const selectedTheme = appearance.theme;
    const selectedLegendTheme = getLegendTheme(selectedTheme);
    const background = appearance.background;

    useEffect(() => {
        ensureMusicAppearanceSettings();
    }, []);

    const handleReset = () => {
        resetTheme();
        settings$.appearance.set(defaultMusicAppearance);
    };

    const handleChooseImage = async () => {
        const paths = await openFileDialog({
            allowedFileTypes: ["png", "jpg", "jpeg", "heic", "webp"],
            allowsMultipleSelection: false,
            canChooseFiles: true,
        });
        const [path] = paths ?? [];
        return path ?? null;
    };

    return (
        <SettingsPage
            actions={
                <Button onClick={handleReset} variant="secondary" className="px-3 py-1.5 h-auto">
                    <Text className="text-sm text-text-primary">Reset</Text>
                </Button>
            }
            contentClassName="p-4"
        >
            <ThemeSelectorSection
                first
                issues={userThemeLoadResult.issues}
                onThemeChange={setMusicTheme}
                selectedTheme={selectedTheme}
                themes={themeOptions}
            />

            <BackgroundSettingsSection
                background={background}
                fallbackColor={selectedLegendTheme.colors.windowBackground}
                onBackgroundChange={(nextBackground) => settings$.appearance.background.set(nextBackground)}
                onChooseImage={handleChooseImage}
            />

            <SettingsSection title="Interface Colors" card={false} className="mt-6" contentClassName="gap-3">
                <ColorPicker label="Background Primary" $color={colors$.background.primary} />
                <ColorPicker label="Background Secondary" $color={colors$.background.secondary} />
                <ColorPicker label="Text Primary" $color={colors$.text.primary} />
                <ColorPicker label="Text Secondary" $color={colors$.text.secondary} />
                <ColorPicker label="Accent" $color={colors$.accent.primary} />
                <ColorPicker label="Border" $color={colors$.border.primary} />
            </SettingsSection>
        </SettingsPage>
    );
};
