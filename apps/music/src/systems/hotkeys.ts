import { observable, syncState } from "@legendapp/state";
import { formatHotkey, parseHotkey, serializeHotkey } from "@legend-desktop/hotkeys";
import { createObservableFile } from "@legend-desktop/storage";
import type { KeyboardEventCodeHotkey } from "@/systems/keyboard/Keyboard";
import { KeyCodes } from "@/systems/keyboard/KeyboardManager";

// Default hotkey settings
const DEFAULT_HOTKEYS = {
    Search: KeyCodes.KEY_J,
    ToggleLibrary: KeyCodes.KEY_L,
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
export const hotkeys$ = createObservableFile<Record<HotkeyName, KeyboardEventCodeHotkey>>({
    filename: "hotkeys.json",
    initialValue: DEFAULT_HOTKEYS,
    root: "cache",
    saveDefaultToFile: true,
    subfolder: "data",
    transform: {
        load: (value: Record<string, KeyboardEventCodeHotkey>) => {
            return Object.fromEntries(
                Object.entries(value).map(([key, val]) => {
                    const parsed = parseHotkey(val);
                    if (parsed.length === 1) {
                        return [key, parsed[0]];
                    }

                    return [key, serializeHotkey(parsed) ?? val];
                }),
            );
        },
        save: (value: Record<string, KeyboardEventCodeHotkey>) => {
            return Object.fromEntries(
                Object.entries(value).map(([key, val]) => {
                    return [key, formatHotkey(val).replaceAll(" + ", "+")];
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
