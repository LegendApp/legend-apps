import { useValue } from "@legendapp/state/react";
import { HotkeyCapture } from "@legendapp/spark/shortcuts/commands";
import { Linking, Text, View } from "react-native";

import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { SettingsRow, SettingsSection } from "./components";
import { Icon } from "../systems/Icon";
import { globalHotkeyStatus$ } from "../systems/GlobalHotkey";
import { AI_SOURCE_IDS, normalizeAISources, settings$, type MusicProviderId } from "../systems/Settings";
import { state$ } from "../systems/State";
import packageJson from "../../package.json";

export function GeneralSettingsContent() {
    const globalHotkeyEnabled = useValue(settings$.general.globalHotkeyEnabled);
    const globalHotkey = useValue(settings$.general.globalHotkey);
    const globalHotkeyError = useValue(globalHotkeyStatus$.error);
    const defaultAISources = normalizeAISources(useValue(settings$.ai.defaultSources));

    const toggleDefaultAISource = (source: MusicProviderId, checked: boolean) => {
        const nextSources = checked
            ? AI_SOURCE_IDS.filter((candidate) => candidate === source || defaultAISources.includes(candidate))
            : defaultAISources.filter((candidate) => candidate !== source);
        if (nextSources.length > 0) settings$.ai.defaultSources.set(nextSources);
    };

    return (
        <>
            <SettingsSection title="Appearance">
                <SettingsRow
                    label="Display Hints"
                    description="Toggle contextual hints like the media library status bar">
                  <Checkbox $checked={settings$.general.showHints} />
                </SettingsRow>
                <SettingsRow
                    label="Show Titlebar on Hover"
                    description="Reveal macOS window controls when hovering near the top edge">
                  <Checkbox $checked={settings$.general.showTitleBarOnHover} />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="AI playlists">
                <SettingsRow
                    label="Show AI toolbar"
                    description="Show source, Auto, and Prompt controls beneath the playlist.">
                  <Checkbox $checked={settings$.ai.toolbarEnabled} />
                </SettingsRow>
                <SettingsRow
                    label="Default music sources"
                    description="Playlists use these sources unless you choose an override in the playlist toolbar. Local copies are always preferred.">
                  <View className="w-44 gap-2">
                      <Checkbox
                          checked={defaultAISources.includes("local")}
                          disabled={defaultAISources.length === 1 && defaultAISources[0] === "local"}
                          label="Local Music"
                          onChange={(checked) => toggleDefaultAISource("local", checked)}
                      />
                      <Checkbox
                          checked={defaultAISources.includes("spotify")}
                          disabled={defaultAISources.length === 1 && defaultAISources[0] === "spotify"}
                          label="Spotify"
                          onChange={(checked) => toggleDefaultAISource("spotify", checked)}
                      />
                      <Checkbox
                          checked={defaultAISources.includes("appleMusic")}
                          disabled={defaultAISources.length === 1 && defaultAISources[0] === "appleMusic"}
                          label="Apple Music"
                          onChange={(checked) => toggleDefaultAISource("appleMusic", checked)}
                      />
                  </View>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="Shortcuts">
                <SettingsRow
                    label="Global Hotkey"
                    description="Show the main window from anywhere">
                  <View className="flex-col items-end gap-2">
                      <View className="flex-row items-center gap-3">
                          <Checkbox $checked={settings$.general.globalHotkeyEnabled} />
                          <HotkeyCapture
                              value={globalHotkey}
                              onChange={(next) => settings$.general.globalHotkey.set(next)}
                              onCaptureChange={(isCapturing) => state$.listeningForKeyPress.set(isCapturing)}
                              disabled={!globalHotkeyEnabled}
                              className={globalHotkeyError ? "border-red-400" : undefined}
                          />
                      </View>
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
