import { batch, event, observable } from "@legendapp/state";
import { useMount, useObserveEffect } from "@legendapp/state/react";
import { formatHotkey, parseHotkey, type HotkeyValue } from "@legend-desktop/hotkeys";
import { DEBUG_HOTKEY_LOGS } from "../constants";
import { getHotkey, getHotkeyMetadata, type HotkeyName } from "../hotkeys";
import KeyboardManager, { type KeyboardEvent, KeyCodes, KeyText } from "./KeyboardManager";
import { state$ } from "../State";
import { ax } from "../../utils/ax";
import { perfCount, perfLog } from "@legend-desktop/runtime-utils";

export type KeyboardEventCodeHotkey = HotkeyValue;

export const keysPressed$ = observable<Record<string, boolean>>({});
const keyRepeat$ = event();

const keysToPreventDefault = new Set<number>();
export const activeWindowId$ = observable("main");

const nativeHotkeyMap = {
    Up: [KeyCodes.KEY_UP],
    Down: [KeyCodes.KEY_DOWN],
    Enter: [KeyCodes.KEY_RETURN],
    Space: [KeyCodes.KEY_SPACE],
    Escape: [KeyCodes.KEY_ESCAPE],
    Delete: [KeyCodes.KEY_DELETE],
    ForwardDelete: [KeyCodes.KEY_FORWARD_DELETE],
    Backspace: [KeyCodes.KEY_DELETE],
    SelectAll: [KeyCodes.MODIFIER_COMMAND, KeyCodes.KEY_A],
} as const;

// Updated KeyInfo to only require the action function
export interface KeyInfo {
    action: () => void;
}

// Global registry for hotkeys with their name and action description
export interface HotkeyInfo {
    name: string;
    key: KeyboardEventCodeHotkey;
    description: string;
    repeat?: boolean;
    keyText?: string;
}
export const hotkeyRegistry$ = observable<Record<string, HotkeyInfo>>({});

const MODIFIERS = [
    KeyCodes.MODIFIER_COMMAND,
    KeyCodes.MODIFIER_SHIFT,
    KeyCodes.MODIFIER_OPTION,
    KeyCodes.MODIFIER_CONTROL,
] as const;

// Handle events to set current key states
const onKeyDown = (e: KeyboardEvent) => {
    perfCount("Keyboard.onKeyDown");
    perfLog("Keyboard.onKeyDown", e);
    const { keyCode, modifiers } = e;

    if (DEBUG_HOTKEY_LOGS) {
        console.log("onKeyDown", keyCode, modifiers);
    }

    batch(() => {
        // Add the pressed key
        const keyStr = keyCode.toString();
        const isAlreadyPressed = keysPressed$[keyStr].get();
        keysPressed$[keyStr].set(true);

        // Handle modifiers
        for (const mod of MODIFIERS) {
            const modStr = mod.toString();
            keysPressed$[modStr].set(!!(modifiers & mod));
        }

        if (isAlreadyPressed) {
            keyRepeat$.fire();
        }
    });

    return state$.listeningForKeyPress.get() || (!state$.showSettings.get() && keysToPreventDefault.has(keyCode));
};

const onKeyUp = (e: KeyboardEvent) => {
    perfCount("Keyboard.onKeyUp");
    perfLog("Keyboard.onKeyUp", e);
    const { keyCode, modifiers } = e;

    batch(() => {
        // Remove the released key
        const keyStr = keyCode.toString();
        keysPressed$[keyStr].delete();

        // Handle modifiers
        for (const mod of MODIFIERS) {
            const modStr = mod.toString();
            keysPressed$[modStr].set(!!(modifiers & mod));
        }
    });

    return state$.listeningForKeyPress.get() || (!state$.showSettings.get() && keysToPreventDefault.has(keyCode));
};

export function useHookKeyboard() {
    perfCount("Keyboard.useHookKeyboard.render");
    useMount(() => {
        perfLog("Keyboard.useHookKeyboard.mountStart");
        // Set up listeners
        let cleanupFns: (() => void)[] = [];
        try {
            cleanupFns = [KeyboardManager.addKeyDownListener(onKeyDown), KeyboardManager.addKeyUpListener(onKeyUp)];
        } catch (error) {
            console.error("Failed to set up keyboard listeners:", error);
        }

        // Return cleanup function
        return () => {
            perfLog("Keyboard.useHookKeyboard.cleanup");
            for (const cleanup of cleanupFns) {
                try {
                    cleanup();
                } catch (error) {
                    console.error("Failed to clean up keyboard listeners:", error);
                }
            }
        };
    });
}

type NativeHotkeyName = keyof typeof nativeHotkeyMap;
type HotkeyBindingName = HotkeyName | NativeHotkeyName;

function isNativeHotkey(name: string): name is NativeHotkeyName {
    return name in nativeHotkeyMap;
}

// Updated HotkeyCallbacks to map hotkey names to simple action functions
type HotkeyCallbacks = Partial<Record<HotkeyBindingName, () => void>>;

export type HotkeyScopeOptions = {
    windowId?: string;
    global?: boolean;
};

export function onHotkeys(hotkeyCallbacks: HotkeyCallbacks, options: HotkeyScopeOptions = {}) {
    const hotkeyMap = new Map<string[], () => void>();
    const repeatActions = new Set<string[]>();
    const targetWindowId = options.global ? undefined : (options.windowId ?? "main");

    const shouldBlockForUI = () => state$.isDropdownOpen.get();

    // Process each combination and its callback
    for (const name of Object.keys(hotkeyCallbacks) as HotkeyBindingName[]) {
        const action = hotkeyCallbacks[name];
        if (action) {
            if (isNativeHotkey(name)) {
                const mapping = nativeHotkeyMap[name];
                const keys = mapping.map((code) => code.toString());
                hotkeyMap.set(keys, action);
                if (name === "Escape") {
                    keysToPreventDefault.add(mapping[mapping.length - 1]);
                }
                continue;
            }

            // Get the configured key for this hotkey from hotkeys$
            const hotkeyName = name as HotkeyName;
            const configuredKey = getHotkey(hotkeyName);
            if (!configuredKey) {
                console.warn(`No hotkey configuration found for ${name}`);
                continue;
            }
            if (DEBUG_HOTKEY_LOGS) {
                console.log("onHotkeys", name, configuredKey);
            }

            const keys = parseHotkey(configuredKey).map((keyCode) => keyCode.toString());
            if (keys.length === 0) {
                console.warn(`No usable hotkey configuration found for ${name}`);
                continue;
            }

            // keysToPreventDefault.add(Number(keys[keys.length - 1]));
            hotkeyMap.set(keys, action);

            // Get metadata for this hotkey
            const metadata = getHotkeyMetadata(hotkeyName);

            if (metadata?.repeat) {
                repeatActions.add(keys);
            }

            // Register the hotkey with its name and action description
            if (metadata) {
                hotkeyRegistry$[hotkeyName].set({
                    name: hotkeyName,
                    key: configuredKey,
                    description: metadata.description,
                    repeat: metadata.repeat,
                    keyText: formatHotkey(configuredKey),
                });
            }
        }
    }

    const checkHotkeys = () => {
        if (shouldBlockForUI()) {
            return;
        }
        if (targetWindowId && activeWindowId$.get() !== targetWindowId) {
            return;
        }
        for (const [keys, callback] of hotkeyMap) {
            // If every key in the hotkey is pressed, call the callback
            const allKeysPressed = keys.every((key) => keysPressed$[key].get());
            if (DEBUG_HOTKEY_LOGS) {
                console.log("checkHotkeys", keys, allKeysPressed);
            }
            if (allKeysPressed) {
                callback();
            }
        }
    };

    const checkRepeatHotkeys = () => {
        if (shouldBlockForUI()) {
            return;
        }
        if (targetWindowId && activeWindowId$.get() !== targetWindowId) {
            return;
        }
        for (const keys of repeatActions) {
            const callback = hotkeyMap.get(keys);
            if (callback) {
                // If every key in the hotkey is pressed, call the callback
                const allKeysPressed = keys.every((key) => keysPressed$[key].get());
                if (allKeysPressed) {
                    callback();
                }
            }
        }
    };

    const unsubs = ax(
        keysPressed$.onChange(checkHotkeys),
        repeatActions.size > 0 ? keyRepeat$.on(checkRepeatHotkeys) : undefined,
    );

    return () => {
        for (const unsub of unsubs) {
            unsub();
        }
    };
}

export function useOnHotkeys(hotkeyCallbacks: HotkeyCallbacks, options: HotkeyScopeOptions = {}) {
    useObserveEffect((e) => {
        const effectiveOptions = options.global
            ? { ...options }
            : {
                  ...options,
                  windowId: options.windowId ?? "main",
              };
        const sub = onHotkeys(hotkeyCallbacks, effectiveOptions);
        e.onCleanup = sub;
    });
}
