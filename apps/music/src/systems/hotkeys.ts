import { observable, syncState } from "@legendapp/state";
import type { KeyboardEventCodeHotkey } from "@/systems/keyboard/Keyboard";
import { KeyCodes, KeyText } from "@/systems/keyboard/KeyboardManager";
import { createJSONManager } from "@/utils/JSONManager";

// Default hotkey settings
const DEFAULT_HOTKEYS = {
    Search: KeyCodes.KEY_J,
    ToggleLibrary: KeyCodes.KEY_L,
    ToggleVisualizer: KeyCodes.KEY_V,
    PlayPause: KeyCodes.KEY_MEDIA_PLAY_PAUSE,
    PlayPauseSpace: KeyCodes.KEY_SPACE,
    NextTrack: KeyCodes.KEY_MEDIA_NEXT,
    PreviousTrack: KeyCodes.KEY_MEDIA_PREVIOUS,
    ToggleShuffle: `${KeyCodes.MODIFIER_OPTION}+${KeyCodes.KEY_S}`,
    ToggleRepeatMode: `${KeyCodes.MODIFIER_OPTION}+${KeyCodes.KEY_R}`,
    Up: KeyCodes.KEY_UP,
    Down: KeyCodes.KEY_DOWN,
    Enter: KeyCodes.KEY_RETURN,
    Space: KeyCodes.KEY_SPACE,
    Delete: KeyCodes.KEY_DELETE,
} as const;

export type HotkeyName = keyof typeof DEFAULT_HOTKEYS;

export const HotkeyMetadata: Record<HotkeyName, { description: string; repeat?: boolean }> = {
    Search: {
        description: "Search files",
    },
    ToggleLibrary: {
        description: "Toggle media library",
    },
    ToggleVisualizer: {
        description: "Toggle visualizer window",
    },
    PlayPause: {
        description: "Toggle playback",
    },
    PlayPauseSpace: {
        description: "Toggle playback (space bar)",
    },
    NextTrack: {
        description: "Play next track",
    },
    PreviousTrack: {
        description: "Play previous track",
    },
    ToggleShuffle: {
        description: "Toggle shuffle mode",
    },
    ToggleRepeatMode: {
        description: "Cycle repeat mode",
    },
    Up: {
        description: "Move selection up",
    },
    Down: {
        description: "Move selection down",
    },
    Enter: {
        description: "Activate selection",
    },
    Space: {
        description: "Activate selection",
    },
    Delete: {
        description: "Delete selected items",
    },
};

// Create the hotkeys manager
export const hotkeys$ = createJSONManager<Record<HotkeyName, KeyboardEventCodeHotkey>>({
    basePath: "Cache",
    filename: "hotkeys.json",
    initialValue: DEFAULT_HOTKEYS,
    saveDefaultToFile: true,
    transform: {
        load: (value: Record<string, KeyboardEventCodeHotkey>) => {
            return Object.fromEntries(
                Object.entries(value).map(([key, val]) => {
                    if (typeof val === "number") {
                        return [key, val];
                    }

                    const segments = `${val}`.split("+");
                    const parsed = segments.map((segment) => {
                        const keyCodeEntry = Object.entries(KeyText).find(([, text]) => text === segment);
                        if (keyCodeEntry) {
                            return Number(keyCodeEntry[0]);
                        }

                        const numeric = Number(segment);
                        if (!Number.isNaN(numeric) && `${numeric}` === segment) {
                            return numeric;
                        }

                        return segment;
                    });

                    if (parsed.length === 1) {
                        const [single] = parsed;
                        return [key, typeof single === "number" ? single : `${single}`];
                    }

                    return [key, parsed.map((part) => `${part}`).join("+")];
                }),
            );
        },
        save: (value: Record<string, KeyboardEventCodeHotkey>) => {
            return Object.fromEntries(
                Object.entries(value).map(([key, val]) => {
                    const vals = `${val}`.split("+");
                    // Add the main key text
                    const parts = vals.map((v) => {
                        if (KeyText[+v]) {
                            return KeyText[+v];
                        }
                        return +v;
                    });

                    // Join with + or return empty string if no parts
                    return [key, parts.join("+")];
                }),
            );
        },
    },
});

export const isHotkeysLoaded$ = observable(() => !!syncState(hotkeys$).isPersistLoaded.get());

export function getHotkey(name: HotkeyName): KeyboardEventCodeHotkey {
    return hotkeys$[name].get();
}

// Export metadata for use in UI
export function getHotkeyMetadata(name: HotkeyName) {
    return HotkeyMetadata[name];
}
