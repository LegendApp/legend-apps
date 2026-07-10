import {
    getDefaultHotkeyBindings,
    normalizeHotkeyFile,
    serializeHotkeyFile,
    type HotkeyDefinition,
    type HotkeyValue,
} from "@legend-apps/hotkeys";
import { createHotkeyStore } from "@legend-apps/hotkeys/storage";
import { createStorage } from "@legend-apps/storage";
import { batch, syncState } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { KeyCodes } from "./keyboard/KeyboardManager";

function binding(...keyCodes: number[]) {
    return keyCodes.join("+") as HotkeyValue;
}

export const musicHotkeyDefinitions = [
    {
        defaultBindings: [binding(KeyCodes.KEY_J)],
        defaultValue: binding(KeyCodes.KEY_J),
        description: "Open the playlist search control.",
        id: "Search",
        title: "Search",
    },
    {
        defaultBindings: [binding(KeyCodes.KEY_L)],
        defaultValue: binding(KeyCodes.KEY_L),
        description: "Show or hide the media library.",
        id: "ToggleLibrary",
        title: "Toggle Media Library",
    },
    {
        defaultBindings: [binding(KeyCodes.KEY_MEDIA_PLAY_PAUSE), binding(KeyCodes.KEY_SPACE)],
        defaultValue: binding(KeyCodes.KEY_MEDIA_PLAY_PAUSE),
        description: "Play or pause the current track.",
        id: "PlayPause",
        title: "Play/Pause",
    },
    {
        defaultBindings: [binding(KeyCodes.KEY_MEDIA_NEXT)],
        defaultValue: binding(KeyCodes.KEY_MEDIA_NEXT),
        description: "Play the next track.",
        id: "NextTrack",
        title: "Next Track",
    },
    {
        defaultBindings: [binding(KeyCodes.KEY_MEDIA_PREVIOUS)],
        defaultValue: binding(KeyCodes.KEY_MEDIA_PREVIOUS),
        description: "Play the previous track.",
        id: "PreviousTrack",
        title: "Previous Track",
    },
    {
        defaultBindings: [binding(KeyCodes.MODIFIER_OPTION, KeyCodes.KEY_S)],
        defaultValue: binding(KeyCodes.MODIFIER_OPTION, KeyCodes.KEY_S),
        description: "Turn shuffle mode on or off.",
        id: "ToggleShuffle",
        title: "Toggle Shuffle",
    },
    {
        defaultBindings: [binding(KeyCodes.MODIFIER_OPTION, KeyCodes.KEY_R)],
        defaultValue: binding(KeyCodes.MODIFIER_OPTION, KeyCodes.KEY_R),
        description: "Cycle between off, repeat all, and repeat one.",
        id: "ToggleRepeatMode",
        title: "Cycle Repeat Mode",
    },
] as const satisfies readonly HotkeyDefinition<string>[];

export const musicInteractionHotkeyDefinitions = [
    {
        allowExtraModifiers: true,
        defaultValue: binding(KeyCodes.KEY_UP),
        id: "Up",
        title: "Move Selection Up",
    },
    {
        allowExtraModifiers: true,
        defaultValue: binding(KeyCodes.KEY_DOWN),
        id: "Down",
        title: "Move Selection Down",
    },
    { defaultValue: binding(KeyCodes.KEY_RETURN), id: "Enter", title: "Activate Selection" },
    { defaultValue: binding(KeyCodes.KEY_SPACE), id: "Space", title: "Activate Selection" },
    { defaultValue: binding(KeyCodes.KEY_ESCAPE), id: "Escape", title: "Clear Selection" },
    { defaultValue: binding(KeyCodes.KEY_DELETE), id: "Delete", title: "Delete Selection" },
    { defaultValue: binding(KeyCodes.KEY_FORWARD_DELETE), id: "ForwardDelete", title: "Delete Selection" },
    { defaultValue: binding(KeyCodes.KEY_BACKSPACE), id: "Backspace", title: "Delete Selection" },
    {
        defaultValue: binding(KeyCodes.MODIFIER_COMMAND, KeyCodes.KEY_A),
        id: "SelectAll",
        title: "Select All",
    },
] as const satisfies readonly HotkeyDefinition<string>[];

export const allMusicHotkeyDefinitions = [
    ...musicHotkeyDefinitions,
    ...musicInteractionHotkeyDefinitions,
] as const;

export type HotkeyName = (typeof musicHotkeyDefinitions)[number]["id"];
export type MusicHotkeyBindingName = (typeof allMusicHotkeyDefinitions)[number]["id"];

function migrateLegacyHotkeys() {
    const currentStorage = createStorage({ root: "applicationSupport" });
    const currentFile = currentStorage.file("hotkeys.json");
    if (currentFile && !currentFile.exists) {
        const legacyStorage = createStorage({ root: "cache", subfolder: "data" });
        const legacy = legacyStorage.read<Record<string, unknown>>("hotkeys.json.json", { format: "json" })
            ?? legacyStorage.read<Record<string, unknown>>("hotkeys.json", { format: "json" });
        if (legacy) {
            const migrated = {
                ...legacy,
                PlayPause: [legacy.PlayPause, legacy.PlayPauseSpace].filter((value) => value !== undefined),
            };
            const normalized = normalizeHotkeyFile(migrated, musicHotkeyDefinitions);
            currentStorage.write("hotkeys.json", serializeHotkeyFile(normalized, musicHotkeyDefinitions), {
                format: "json",
            });
        }
    }
}

migrateLegacyHotkeys();

const musicHotkeyFile$ = createHotkeyStore({
    definitions: musicHotkeyDefinitions,
    filename: "hotkeys",
});

export const hotkeys$ = musicHotkeyFile$.bindings;
export const isHotkeysLoaded$ = syncState(musicHotkeyFile$).isPersistLoaded;

export function useMusicHotkeyBindings() {
    return useValue(hotkeys$);
}

export function setMusicHotkeyBindings(id: HotkeyName, bindings: readonly HotkeyValue[]) {
    hotkeys$[id].set([...bindings]);
}

export function resetMusicHotkeyBindings() {
    batch(() => {
        for (const definition of musicHotkeyDefinitions) {
            hotkeys$[definition.id].set([...getDefaultHotkeyBindings(definition)]);
        }
    });
}
