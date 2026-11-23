import {
    getDefaultHotkeyBindings,
    hotkeyBindingListsEqual,
    HotkeyCapture,
} from "@legendapp/spark/shortcuts/commands";
import { Button } from "@legendapp/spark/ui";
import { View } from "react-native";
import { SettingsRow, SettingsSection } from "./components";
import {
    musicHotkeyDefinitions,
    resetMusicHotkeyBindings,
    setMusicHotkeyBindings,
    useMusicHotkeyBindings,
} from "../systems/hotkeys";

export function HotkeysSettingsContent() {
    const bindings = useMusicHotkeyBindings();
    const valuesFor = (definition: (typeof musicHotkeyDefinitions)[number]) =>
        bindings[definition.id] ?? getDefaultHotkeyBindings(definition);
    let hasCustomBindings = false;

    const rows = musicHotkeyDefinitions.map((definition) => {
        const defaults = getDefaultHotkeyBindings(definition);
        const values = valuesFor(definition);
        hasCustomBindings ||= !hotkeyBindingListsEqual(values, defaults);
        const value = values[0] ?? null;
        const conflictTitles = musicHotkeyDefinitions
            .filter((other) => other !== definition && value !== null
                && valuesFor(other).some((binding) => hotkeyBindingListsEqual([binding], [value])))
            .map((other) => other.title);
        return (
            <SettingsRow
                key={definition.id}
                label={definition.title}
                description={conflictTitles.length > 0 ? `Also triggers ${conflictTitles.join(", ")}.` : definition.description}
            >
                <HotkeyCapture
                    value={value}
                    onChange={(next) => {
                        if (next !== null) setMusicHotkeyBindings(definition.id, [next, ...values.slice(1)]);
                    }}
                />
            </SettingsRow>
        );
    });

    return (
        <>
            <SettingsSection>{rows}</SettingsSection>
            <View className="flex-row justify-end">
                <Button disabled={!hasCustomBindings} onPress={resetMusicHotkeyBindings}>
                    Restore Defaults
                </Button>
            </View>
        </>
    );
}
