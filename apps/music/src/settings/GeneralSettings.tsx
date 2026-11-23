import { useValue } from "@legendapp/state/react";
import { HotkeyCapture } from "@legendapp/spark/shortcuts/commands";
import { Button } from "@legendapp/spark/ui";
import { Linking, PlatformColor, StyleSheet, Text, View } from "react-native";

import { SettingsCaption, SettingsRow, SettingsSection, SettingsSwitchRow } from "./components";
import { globalHotkeyStatus$ } from "../systems/GlobalHotkey";
import { AI_SOURCE_IDS, AI_SOURCE_LABELS, normalizeAISources, settings$, type MusicProviderId } from "../systems/Settings";
import { state$ } from "../systems/State";
import packageJson from "../../package.json";

export function GeneralSettingsContent() {
    const showHints = useValue(settings$.general.showHints);
    const showTitleBarOnHover = useValue(settings$.general.showTitleBarOnHover);
    const globalHotkeyEnabled = useValue(settings$.general.globalHotkeyEnabled);
    const globalHotkey = useValue(settings$.general.globalHotkey);
    const globalHotkeyError = useValue(globalHotkeyStatus$.error);
    const aiToolbarEnabled = useValue(settings$.ai.toolbarEnabled);
    const defaultAISources = normalizeAISources(useValue(settings$.ai.defaultSources));

    const toggleDefaultAISource = (source: MusicProviderId, checked: boolean) => {
        const currentSources = normalizeAISources(settings$.ai.defaultSources.peek());
        const nextSources = checked
            ? AI_SOURCE_IDS.filter((candidate) => candidate === source || currentSources.includes(candidate))
            : currentSources.filter((candidate) => candidate !== source);
        if (nextSources.length > 0) settings$.ai.defaultSources.set(nextSources);
    };

    return (
        <>
            <SettingsSection title="Appearance">
                <SettingsSwitchRow
                    label="Display Hints"
                    description="Toggle contextual hints like the media library status bar"
                    value={showHints}
                    onValueChange={(value) => settings$.general.showHints.set(value)}
                />
                <SettingsSwitchRow
                    label="Show Titlebar on Hover"
                    description="Reveal macOS window controls when hovering near the top edge"
                    value={showTitleBarOnHover}
                    onValueChange={(value) => settings$.general.showTitleBarOnHover.set(value)}
                />
            </SettingsSection>

            <SettingsSection title="AI playlists">
                <SettingsSwitchRow
                    label="Enable AI playlists"
                    description="Adds a small AI button to the playlist for adding songs automatically or from a prompt."
                    value={aiToolbarEnabled}
                    onValueChange={(value) => settings$.ai.toolbarEnabled.set(value)}
                />
                {aiToolbarEnabled ? (
                    <SettingsCaption>
                        Find songs in these sources. A matching local copy is always preferred.
                    </SettingsCaption>
                ) : null}
                {aiToolbarEnabled
                    ? AI_SOURCE_IDS.map((source) => {
                          const enabled = defaultAISources.includes(source);
                          return (
                              <SettingsSwitchRow
                                  key={source}
                                  label={AI_SOURCE_LABELS[source]}
                                  value={enabled}
                                  disabled={enabled && defaultAISources.length === 1}
                                  onValueChange={(value) => toggleDefaultAISource(source, value)}
                              />
                          );
                      })
                    : null}
            </SettingsSection>

            <SettingsSection title="Shortcuts">
                <SettingsSwitchRow
                    label="Global Hotkey"
                    description="Show the main window from anywhere"
                    value={globalHotkeyEnabled}
                    onValueChange={(value) => settings$.general.globalHotkeyEnabled.set(value)}
                />
                <SettingsRow label="Shortcut">
                    <View className="flex-col items-end gap-2">
                        <HotkeyCapture
                            value={globalHotkey}
                            onChange={(next) => settings$.general.globalHotkey.set(next)}
                            onCaptureChange={(isCapturing) => state$.listeningForKeyPress.set(isCapturing)}
                            disabled={!globalHotkeyEnabled}
                            className={globalHotkeyError ? "border-red-400" : undefined}
                        />
                        {globalHotkeyError ? (
                            <Text className="text-xs text-red-200">{globalHotkeyError}</Text>
                        ) : null}
                    </View>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="About">
                <SettingsRow label="Version">
                    <Text style={styles.value}>{packageJson.version}</Text>
                </SettingsRow>
                <SettingsRow label="Feedback" description="Found a bug or have an idea? Open an issue on GitHub.">
                    <Button onPress={() => Linking.openURL("https://github.com/LegendApp/legend-music/issues/new")}>
                        Report an Issue
                    </Button>
                </SettingsRow>
            </SettingsSection>
        </>
    );
}

const styles = StyleSheet.create({
    value: { color: PlatformColor("secondaryLabelColor"), fontSize: 13 },
});
