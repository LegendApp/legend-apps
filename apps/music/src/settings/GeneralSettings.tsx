import { useValue } from "@legendapp/state/react";
import { HotkeyCapture } from "@legendapp/spark/shortcuts/commands";
import { Linking, Text, View } from "react-native";

import { Button } from "../components/Button";
import { SettingsRow, SettingsSection, SettingsSwitchRow } from "./components";
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
                    label="Show AI toolbar"
                    description="Show source, Auto, and Prompt controls beneath the playlist."
                    value={aiToolbarEnabled}
                    onValueChange={(value) => settings$.ai.toolbarEnabled.set(value)}
                />
            </SettingsSection>

            <SettingsSection title="Default music sources">
                <Text className="px-3 py-2 text-sm text-text-secondary">
                    Playlists use these sources unless you choose an override in the playlist toolbar. Local copies are always preferred.
                </Text>
                {AI_SOURCE_IDS.map((source) => {
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
                })}
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
                <View className="flex-row items-center gap-3">
                    <View className="flex-1">
                        <Text className="text-text-primary font-semibold text-sm">Version</Text>
                        <Text className="text-text-secondary text-sm">{packageJson.version}</Text>
                    </View>
                    <Button
                        variant="primary"
                        icon="exclamationmark.circle"
                        size="medium"
                        onClick={() => Linking.openURL("https://github.com/LegendApp/legend-music/issues/new")}
                    >
                        <Text className="text-text-primary font-medium text-sm">Report an Issue</Text>
                    </Button>
                </View>
            </SettingsSection>
        </>
    );
}
