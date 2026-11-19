import {
    getDefaultHotkeyBindings,
    hotkeyFileVersion,
    normalizeHotkeyBindings,
    normalizeHotkeyFile,
    serializeHotkeyFile,
    type HotkeyDefinition,
    type HotkeyValue,
} from "@legendapp/spark/shortcuts/commands";
import { createObservableFile } from "@legend-apps/storage";
import { createStorage } from "@legend-apps/storage";
import { batch, syncState } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { KeyCodes } from "./keyboard/KeyboardManager";



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
        defaultBindings: ["MediaPlayPause"],
        description: "Play or pause the current track.",
        id: "PlayPause",
        title: "Play/Pause",
    },
    {
        defaultBindings: ["Space"],
        description: "Play or pause when no track is selected.",
        id: "PlayPauseSpace",
        title: "Play/Pause (Space)",
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

const legacyKeyNames: Record<string, string> = {
    COMMA: ",",
    DELETE: "Backspace",
    EQUALS: "=",
    ESCAPE: "Escape",
    FORWARD_DELETE: "Delete",
    LEFT_BRACKET: "[",
    MEDIA_NEXT: "MediaNext",
    MEDIA_PLAY_PAUSE: "MediaPlayPause",
    MEDIA_PREVIOUS: "MediaPrevious",
    MINUS: "-",
    PAGE_DOWN: "PageDown",
    PAGE_UP: "PageUp",
    PERIOD: ".",
    RETURN: "Enter",
    RIGHT_BRACKET: "]",
    SLASH: "/",
};
const legacyModifierNames: Record<string, string> = {
    COMMAND: "Cmd",
    CONTROL: "Ctrl",
    FUNCTION: "Fn",
    OPTION: "Alt",
    SHIFT: "Shift",
};
const legacyKeyCodeNames = new Map<number, string>();
for (const [name, code] of Object.entries(KeyCodes)) {
    const key = name.replace(/^(KEY|MODIFIER)_/, "");
    const label = name.startsWith("MODIFIER_")
        ? legacyModifierNames[key]
        : legacyKeyNames[key] ?? key.charAt(0) + key.slice(1).toLowerCase();
    if (label && !legacyKeyCodeNames.has(code)) legacyKeyCodeNames.set(code, label);
}

// The original app saved its key labels, such as "⌥+S" or "Next Track".
const legacyKeyTexts: Record<string, string> = {
    "←": "Left",
    "↑": "Up",
    "→": "Right",
    "↓": "Down",
    "↩": "Enter",
    "⇥": "Tab",
    "⌃": "Ctrl",
    "⌘": "Cmd",
    "⌥": "Alt",
    "⇧": "Shift",
    "⌫": "Backspace",
    "⌦": "Delete",
    Esc: "Escape",
    "Next Track": "MediaNext",
    "Play/Pause": "MediaPlayPause",
    "Previous Track": "MediaPrevious",
};

// Older builds saved bindings as "+"-joined key codes, such as "524288+1" for Alt+S, or as key labels.
function fromLegacyBinding(binding: unknown) {
    const tokens = String(binding).split("+");
    const names = tokens.map((token) => (/^\d+$/.test(token) ? legacyKeyCodeNames.get(Number(token)) : legacyKeyTexts[token] ?? token));
    return names.every(Boolean) ? names.join("+") : binding;
}

function loadBindings(stored: unknown, definition: HotkeyDefinition<string>) {
    for (const candidate of [stored, Array.isArray(stored) ? stored.map(fromLegacyBinding) : stored]) {
        try {
            return normalizeHotkeyBindings(candidate as readonly string[]);
        } catch {}
    }
    return getDefaultHotkeyBindings(definition);
}

// The original app saved one flat binding per command, with Space as a separate PlayPauseSpace command.
function fromLegacyFlatFile(file: Record<string, unknown>) {
    const stored: Record<string, unknown[]> = {};
    for (const [id, binding] of Object.entries(file)) {
        if (binding !== "" && binding != null) (stored[id] ??= []).push(binding);
    }
    return stored;
}

export function loadMusicHotkeyFile(value: unknown) {
    const file = value as { bindings?: Record<string, unknown> } | undefined;
    const stored = file?.bindings ?? (file && typeof file === "object" && !("version" in file) ? fromLegacyFlatFile(file) : {});
    const bindings = Object.fromEntries(
        musicHotkeyDefinitions.map((definition) => [
            definition.id,
            definition.id in stored ? loadBindings(stored[definition.id], definition) : undefined,
        ]),
    );
    // Builds that merged the two commands stored Space alongside the media binding.
    if (!("PlayPauseSpace" in stored) && Array.isArray(bindings.PlayPause) && bindings.PlayPause.includes("Space")) {
        bindings.PlayPause = bindings.PlayPause.filter(binding => binding !== "Space");
        bindings.PlayPauseSpace = ["Space"];
    }
    return normalizeHotkeyFile({ version: hotkeyFileVersion, bindings }, musicHotkeyDefinitions);
}

const musicHotkeyFile$ = createObservableFile({
    initialValue: normalizeHotkeyFile(undefined, musicHotkeyDefinitions),
    transform: { load: loadMusicHotkeyFile, save: value => serializeHotkeyFile(value, musicHotkeyDefinitions) },
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
