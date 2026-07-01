import { useValue } from "@legendapp/state/react";
import { HotkeyCapture } from "@legend-desktop/hotkeys";
import { Linking, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Checkbox } from "@/components/Checkbox";
import { SettingsPage, SettingsRow, SettingsSection } from "@/settings/components";
import { Icon } from "@/systems/Icon";
import { globalHotkeyStatus$ } from "@/systems/GlobalHotkey";
import { settings$ } from "@/systems/Settings";
import { state$ } from "@/systems/State";
import packageJson from "../../package.json";

export const GeneralSettings = function GeneralSettings() {
    return (
        <SettingsPage>
            <GeneralSettingsContent />
        </SettingsPage>
    );
};

export function GeneralSettingsContent() {
    const globalHotkeyEnabled = useValue(settings$.general.globalHotkeyEnabled);
    const globalHotkey = useValue(settings$.general.globalHotkey);
    const globalHotkeyError = useValue(globalHotkeyStatus$.error);

    // const playlistStyleOptions = [
    //     { value: "compact", label: "Compact" },
    //     { value: "comfortable", label: "Comfortable" },
    // ];

    return (
        <>
            <SettingsSection title="Appearance" first>
                {/* <SettingsRow
                    title="Playlist Style"
                    description="Choose how playlist items are displayed"
                    control={
                        <Select
                            value$={settings$.general.playlistStyle}
                            options={playlistStyleOptions}
                            placeholder="Select style..."
                            triggerClassName="px-3"
                        />
                    }
                    controlWrapperClassName="w-40 ml-6"
                /> */}

                <SettingsRow
                    title="Display Hints"
                    description="Toggle contextual hints like the media library status bar"
                    control={<Checkbox $checked={settings$.general.showHints} />}
                />
                <SettingsRow
                    title="Show Titlebar on Hover"
                    description="Reveal macOS window controls when hovering near the top edge"
                    control={<Checkbox $checked={settings$.general.showTitleBarOnHover} />}
                />
            </SettingsSection>

            <SettingsSection title="Shortcuts">
                <SettingsRow
                    title="Global Hotkey"
                    description="Show the main window from anywhere"
                    align="center"
                    control={
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
                    }
                />
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
