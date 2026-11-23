import { isNumber, linked } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { $TextInput } from "@legendapp/state/react-native";
import { View } from "react-native";
import { settingsInputFrame, settingsInputStyle, settingsInputText, SettingsRow, SettingsSection, SettingsSelectRow, SettingsSwitchRow } from "./components";
import {
    OVERLAY_MAX_DISPLAY_DURATION_SECONDS,
    OVERLAY_MIN_DISPLAY_DURATION_SECONDS,
    settings$,
} from "../systems/Settings";

const verticalOptions = [
    { value: "top", label: "Top" },
    { value: "middle", label: "Middle" },
    { value: "bottom", label: "Bottom" },
];

const horizontalOptions = [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
];

export function OverlaySettingsContent() {
    const durationSeconds$ = settings$.overlay.displayDurationSeconds;
    const overlayEnabled = useValue(settings$.overlay.enabled);
    const verticalPosition = useValue(settings$.overlay.position.vertical);
    const horizontalPosition = useValue(settings$.overlay.position.horizontal);
    const durationText$ = useObservable(
        linked({
            get: () => `${durationSeconds$.get()}`,
            set: ({ value }) => {
                const sanitized = value.replace(/[^0-9]/g, "");

                const parsed = Number.parseInt(sanitized, 10);
                if (isNumber(parsed)) {
                    const clamped = Math.max(
                        OVERLAY_MIN_DISPLAY_DURATION_SECONDS,
                        Math.min(parsed, OVERLAY_MAX_DISPLAY_DURATION_SECONDS),
                    );
                    durationSeconds$.set(clamped);
                }
            },
        }),
    );

    return (
        <>
            <SettingsSection>
                <SettingsSwitchRow
                    label="Enable overlay"
                    description="Show the current song overlay when a new track begins"
                    value={overlayEnabled}
                    onValueChange={(value) => settings$.overlay.enabled.set(value)}
                />

                <SettingsRow
                    label="Display duration"
                    description={`Seconds, ${OVERLAY_MIN_DISPLAY_DURATION_SECONDS}–${OVERLAY_MAX_DISPLAY_DURATION_SECONDS}`}>
                    <View className={`${settingsInputFrame} w-20`}>
                        <$TextInput
                            $value={durationText$}
                            keyboardType="numeric"
                            className={`${settingsInputText} text-center`}
                            style={settingsInputStyle}
                            accessibilityLabel="Overlay display duration"
                        />
                    </View>
                </SettingsRow>

                <SettingsSelectRow
                    label="Vertical position"
                    options={verticalOptions}
                    value={verticalPosition}
                    disabled={!overlayEnabled}
                    onValueChange={(value) => settings$.overlay.position.vertical.set(value as typeof verticalPosition)}
                />
                <SettingsSelectRow
                    label="Horizontal position"
                    options={horizontalOptions}
                    value={horizontalPosition}
                    disabled={!overlayEnabled}
                    onValueChange={(value) => settings$.overlay.position.horizontal.set(value as typeof horizontalPosition)}
                />
            </SettingsSection>
        </>
    );
}
