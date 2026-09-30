import {
    getDefaultHotkeyBindings,
    normalizeHotkeyFile,
    serializeHotkeyFile,
    type HotkeyDefinition,
    type HotkeyValue,
} from "@legendapp/spark/shortcuts/commands";
import { createObservableFile } from "@legend-apps/storage";
import { createStorage } from "@legend-apps/storage";
import { batch, syncState } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";



export const musicHotkeyDefinitions = [
    {
        defaultBindings: ["J"],
        description: "Open the playlist search control.",
        id: "Search",
        title: "Search",
    },
    {
        defaultBindings: ["L"],
        description: "Show or hide the media library.",
        id: "ToggleLibrary",
        title: "Toggle Media Library",
    },
    {
        defaultBindings: ["MediaPlayPause", "Space"],
        description: "Play or pause the current track.",
        id: "PlayPause",
        title: "Play/Pause",
    },
    {
        defaultBindings: ["MediaNext"],
        description: "Play the next track.",
        id: "NextTrack",
        title: "Next Track",
    },
    {
        defaultBindings: ["MediaPrevious"],
        description: "Play the previous track.",
        id: "PreviousTrack",
        title: "Previous Track",
    },
    {
        defaultBindings: ["Alt+S"],
        description: "Turn shuffle mode on or off.",
        id: "ToggleShuffle",
        title: "Toggle Shuffle",
    },
    {
        defaultBindings: ["Alt+R"],
        description: "Cycle between off, repeat all, and repeat one.",
        id: "ToggleRepeatMode",
        title: "Cycle Repeat Mode",
    },
] as const satisfies readonly HotkeyDefinition<string>[];

export const musicInteractionHotkeyDefinitions = [
    {
        allowExtraModifiers: true,
        defaultBindings: ["Up"],
        id: "Up",
        title: "Move Selection Up",
    },
    {
        allowExtraModifiers: true,
        defaultBindings: ["Down"],
        id: "Down",
        title: "Move Selection Down",
    },
    { defaultBindings: ["Enter"], id: "Enter", title: "Activate Selection" },
    { defaultBindings: ["Space"], id: "Space", title: "Activate Selection" },
    { defaultBindings: ["Escape"], id: "Escape", title: "Clear Selection" },
    { defaultBindings: ["Backspace"], id: "Delete", title: "Delete Selection" },
    { defaultBindings: ["Delete"], id: "ForwardDelete", title: "Delete Selection" },
    { defaultBindings: ["Backspace"], id: "Backspace", title: "Delete Selection" },
    {
        defaultBindings: ["Cmd+A"],
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

const musicHotkeyFile$ = createObservableFile({
    initialValue: normalizeHotkeyFile(undefined, musicHotkeyDefinitions),
    transform: { load: value => normalizeHotkeyFile(value, musicHotkeyDefinitions), save: value => serializeHotkeyFile(value, musicHotkeyDefinitions) },
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
