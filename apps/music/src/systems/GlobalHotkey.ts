import { observable } from "@legendapp/state";
import { useMount, useObserveEffect } from "@legendapp/state/react";
import { useRef } from "react";
import { Platform } from "react-native";
import { addGlobalHotkeyListener, registerGlobalHotkey, unregisterGlobalHotkey } from "@legend-desktop/global-hotkey";
import { parseHotkey as parseHotkeyValue } from "@legend-desktop/hotkeys";
import { useWindowManager } from "@legend-desktop/window-manager";
import { settings$ } from "@/systems/Settings";
import type { KeyboardEventCodeHotkey } from "@/systems/keyboard/Keyboard";
import { KeyCodes } from "@/systems/keyboard/KeyboardManager";

export const globalHotkeyStatus$ = observable({
    error: null as string | null,
});

const clearError = () => {
    globalHotkeyStatus$.error.set(null);
};

const setError = (message: string | undefined) => {
    globalHotkeyStatus$.error.set(message || "Failed to register global hotkey.");
};

const MODIFIER_CODES = new Set<number>([
    KeyCodes.MODIFIER_COMMAND,
    KeyCodes.MODIFIER_SHIFT,
    KeyCodes.MODIFIER_OPTION,
    KeyCodes.MODIFIER_CONTROL,
    KeyCodes.MODIFIER_CAPS_LOCK,
    KeyCodes.MODIFIER_FUNCTION,
]);

function parseHotkey(value: KeyboardEventCodeHotkey | null) {
    let parsed: { keyCode: number; modifiers: number } | null = null;
    if (value) {
        const codes = parseHotkeyValue(value);
        const modifiers = codes.filter((code) => MODIFIER_CODES.has(code));
        const keys = codes.filter((code) => !MODIFIER_CODES.has(code));
        const keyCode = keys.length > 0 ? keys[keys.length - 1] : null;
        if (keyCode !== null && keyCode >= 0 && keyCode <= 255) {
            parsed = {
                keyCode,
                modifiers: modifiers.reduce((mask, code) => mask | code, 0),
            };
        }
    }
    return parsed;
}

export function GlobalHotkeyManager() {
    const windowManagerRef = useRef(useWindowManager());

    useObserveEffect(() => {
        const enabled = settings$.general.globalHotkeyEnabled.get();
        const hotkey = settings$.general.globalHotkey.get();

        if (!enabled) {
            void unregisterGlobalHotkey().then(clearError);
            return;
        }

        const parsed = parseHotkey(hotkey);
        if (parsed) {
            void registerGlobalHotkey(parsed.keyCode, parsed.modifiers).then((result) => {
                if (result.success) {
                    clearError();
                } else {
                    setError(result.message);
                }
            });
        } else {
            setError("No valid hotkey found.");
        }
    });

    useMount(() => {
        if (Platform.OS !== "macos") {
            return;
        }

        const subscription = addGlobalHotkeyListener(() => {
            void windowManagerRef.current.showMainWindow();
        });

        return () => {
            subscription.remove();
            void unregisterGlobalHotkey();
        };
    });

    return null;
}
