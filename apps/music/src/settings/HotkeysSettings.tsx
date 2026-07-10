import { HotkeyBindingsSettingsContent } from "@legend-apps/hotkeys";
import {
    musicHotkeyDefinitions,
    resetMusicHotkeyBindings,
    setMusicHotkeyBindings,
    useMusicHotkeyBindings,
} from "../systems/hotkeys";

export function HotkeysSettingsContent() {
    const bindings = useMusicHotkeyBindings();

    return (
        <HotkeyBindingsSettingsContent
            definitions={musicHotkeyDefinitions}
            onChange={setMusicHotkeyBindings}
            onResetAll={resetMusicHotkeyBindings}
            showTitle={false}
            values={bindings}
        />
    );
}
