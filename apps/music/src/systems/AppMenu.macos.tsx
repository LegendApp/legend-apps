import { useEffect } from "react";
import { AutoUpdater } from "@legend-desktop/auto-updater";
import {
    type NativeMenuAction,
    type NativeMenuConfig,
    type NativeMenuItemPatch,
    type NativeMenuShortcut,
    updateMenuItems,
    useNativeMenu,
} from "@legend-desktop/native-menu";
import { localAudioControls, localPlayerState$, queue$ } from "@/components/LocalAudioPlayer";
import { savePlaylistUI$ } from "@/state/savePlaylistUIState";
import { type RepeatMode, settings$ } from "@/systems/Settings";
import { state$, stateSaved$ } from "@/systems/State";
import { hotkeys$ } from "@/systems/hotkeys";
import type { KeyboardEventCodeHotkey } from "@/systems/keyboard/Keyboard";
import { KeyCodes, KeyText } from "@/systems/keyboard/KeyboardManager";
import { perfCount, perfLog } from "@/utils/perfLogger";

const MENU_OWNER_ID = "music";
const APP_MENU_ID = "app";
const FILE_MENU_ID = "file";
const PLAYBACK_MENU_ID = "playback";
const VIEW_MENU_ID = "view";

const MENU_MODIFIERS = [
    KeyCodes.MODIFIER_COMMAND,
    KeyCodes.MODIFIER_SHIFT,
    KeyCodes.MODIFIER_OPTION,
    KeyCodes.MODIFIER_CONTROL,
    KeyCodes.MODIFIER_CAPS_LOCK,
    KeyCodes.MODIFIER_FUNCTION,
] as const;
const MENU_MODIFIER_SET = new Set<number>(MENU_MODIFIERS);

const FUNCTION_KEY_EQUIVALENTS: Record<number, number> = {
    [KeyCodes.KEY_UP]: 0xf700,
    [KeyCodes.KEY_DOWN]: 0xf701,
    [KeyCodes.KEY_LEFT]: 0xf702,
    [KeyCodes.KEY_RIGHT]: 0xf703,
};

const TEXT_TO_KEYCODE = Object.entries(KeyText).reduce<Record<string, number>>((acc, [key, text]) => {
    acc[text] = Number(key);
    return acc;
}, {});

const MENU_CONFIG: NativeMenuConfig[] = [
    {
        id: APP_MENU_ID,
        title: "Legend Music",
        systemMenu: "app",
        items: [
            {
                id: "settings",
                targetTitles: ["Settings…", "Settings...", "Preferences…", "Preferences..."],
            },
            {
                id: "checkForUpdates",
                title: "Check for Updates...",
            },
        ],
    },
    {
        id: FILE_MENU_ID,
        title: "File",
        items: [
            {
                id: "savePlaylist",
                title: "Save Playlist",
                targetTitles: ["Save…", "Save..."],
            },
            {
                id: "jump",
                title: "Jump",
                shortcut: { key: "j", modifiers: KeyCodes.MODIFIER_COMMAND },
            },
        ],
    },
    {
        id: VIEW_MENU_ID,
        title: "View",
        items: [
            {
                id: "toggleLibrary",
                title: "Media Library",
            },
        ],
    },
    {
        id: PLAYBACK_MENU_ID,
        title: "Playback",
        placement: { before: "Window" },
        items: [
            {
                id: "playbackPrevious",
                title: "Previous Track",
            },
            {
                id: "playbackPlayPause",
                title: "Play",
            },
            {
                id: "playbackNext",
                title: "Next Track",
            },
            {
                id: "playbackSeparator",
                separator: true,
            },
            {
                id: "playbackToggleShuffle",
                title: "Shuffle",
            },
            {
                id: "playbackToggleRepeat",
                title: "Repeat Off",
            },
        ],
    },
];

function parseSegmentToKeyCode(segment: string | number): number | null {
    const textSegment = `${segment}`;
    if (textSegment.length === 0) {
        return null;
    }
    if (TEXT_TO_KEYCODE[textSegment] !== undefined) {
        return TEXT_TO_KEYCODE[textSegment];
    }

    const numeric = Number(textSegment);
    return Number.isNaN(numeric) ? null : numeric;
}

function keyCodeToMenuKeyEquivalent(keyCode: number): string | null {
    if (FUNCTION_KEY_EQUIVALENTS[keyCode] !== undefined) {
        return String.fromCharCode(FUNCTION_KEY_EQUIVALENTS[keyCode]);
    }

    switch (keyCode) {
        case KeyCodes.KEY_RETURN:
            return "\r";
        case KeyCodes.KEY_TAB:
            return "\t";
        case KeyCodes.KEY_SPACE:
            return " ";
        case KeyCodes.KEY_ESCAPE:
            return "\u001b";
        case KeyCodes.KEY_DELETE:
        case KeyCodes.KEY_BACKSPACE:
            return "\u0008";
        case KeyCodes.KEY_FORWARD_DELETE:
            return String.fromCharCode(0x007f);
        default: {
            const text = KeyText[keyCode];
            return text && text.length === 1 ? text.toLowerCase() : null;
        }
    }
}

function hotkeyToMenuShortcut(hotkey?: KeyboardEventCodeHotkey): NativeMenuShortcut | null {
    if (hotkey === undefined || hotkey === null) {
        return null;
    }

    const segments = typeof hotkey === "number" ? [hotkey] : `${hotkey}`.split("+");
    let modifiers = 0;
    let keyCode: number | null = null;

    for (const segment of segments) {
        const parsed = parseSegmentToKeyCode(segment);
        if (parsed !== null && MENU_MODIFIER_SET.has(parsed)) {
            modifiers |= parsed;
        } else if (parsed !== null && keyCode === null) {
            keyCode = parsed;
        }
    }

    const keyEquivalent = keyCode === null ? null : keyCodeToMenuKeyEquivalent(keyCode);
    return keyEquivalent ? { key: keyEquivalent, modifiers } : null;
}

function updateMusicMenuItems(patches: NativeMenuItemPatch[]) {
    updateMenuItems(MENU_OWNER_ID, patches);
}

function getRepeatMenuPatch(mode: RepeatMode): NativeMenuItemPatch {
    return {
        id: "playbackToggleRepeat",
        checked: mode !== "off",
        title: mode === "all" ? "Repeat All" : mode === "one" ? "Repeat One" : "Repeat Off",
    };
}

function getPlaybackShortcutPatches(): NativeMenuItemPatch[] {
    const hotkeys = hotkeys$.get();
    const playPauseShortcut =
        hotkeyToMenuShortcut(hotkeys.PlayPause) ?? hotkeyToMenuShortcut(hotkeys.PlayPauseSpace);

    return [
        { id: "playbackPrevious", shortcut: hotkeyToMenuShortcut(hotkeys.PreviousTrack) },
        { id: "playbackPlayPause", shortcut: playPauseShortcut },
        { id: "playbackNext", shortcut: hotkeyToMenuShortcut(hotkeys.NextTrack) },
        { id: "playbackToggleShuffle", shortcut: hotkeyToMenuShortcut(hotkeys.ToggleShuffle) },
        { id: "playbackToggleRepeat", shortcut: hotkeyToMenuShortcut(hotkeys.ToggleRepeatMode) },
    ];
}

function syncMenuState() {
    updateMusicMenuItems([
        {
            id: "playbackToggleShuffle",
            checked: !!settings$.playback.shuffle.get(),
        },
        getRepeatMenuPatch(settings$.playback.repeatMode.get()),
        {
            id: "playbackPlayPause",
            title: localPlayerState$.isPlaying.get() ? "Pause" : "Play",
        },
        {
            id: "toggleLibrary",
            checked: !!stateSaved$.libraryIsOpen.get(),
        },
        {
            id: "savePlaylist",
            enabled: queue$.tracks.get().length > 0,
        },
        ...getPlaybackShortcutPatches(),
    ]);
}

function toggleLibraryWindow() {
    const current = stateSaved$.libraryIsOpen.get();
    stateSaved$.libraryIsOpen.set(!current);
}

function handleMenuAction(action: NativeMenuAction) {
    perfCount("AppMenu.onMenuCommand");
    perfLog("AppMenu.onMenuCommand", action);

    switch (action.itemId) {
        case "settings":
            state$.showSettings.set(true);
            break;
        case "jump":
            perfLog("AppMenu.jumpCommand");
            break;
        case "savePlaylist":
            if (queue$.tracks.get().length > 0) {
                savePlaylistUI$.isOpen.set(true);
            }
            break;
        case "toggleLibrary":
            toggleLibraryWindow();
            break;
        case "playbackPrevious":
            localAudioControls.playPrevious();
            break;
        case "playbackPlayPause":
            void localAudioControls.togglePlayPause();
            break;
        case "playbackNext":
            localAudioControls.playNext();
            break;
        case "playbackToggleShuffle":
            localAudioControls.toggleShuffle();
            break;
        case "playbackToggleRepeat":
            localAudioControls.cycleRepeatMode();
            break;
        case "checkForUpdates":
            void AutoUpdater.checkForUpdates();
            break;
        default:
            break;
    }
}

export function AppMenuController() {
    useNativeMenu({
        menus: MENU_CONFIG,
        onAction: handleMenuAction,
        ownerId: MENU_OWNER_ID,
    });

    useEffect(() => {
        const unsubscribeMenuState = [
            settings$.playback.shuffle.onChange(({ value }) => {
                updateMusicMenuItems([{ id: "playbackToggleShuffle", checked: !!value }]);
            }),
            settings$.playback.repeatMode.onChange(({ value }) => {
                updateMusicMenuItems([getRepeatMenuPatch(value as RepeatMode)]);
            }),
            localPlayerState$.isPlaying.onChange(({ value }) => {
                updateMusicMenuItems([{ id: "playbackPlayPause", title: value ? "Pause" : "Play" }]);
            }),
            stateSaved$.libraryIsOpen.onChange(() => {
                updateMusicMenuItems([{ id: "toggleLibrary", checked: !!stateSaved$.libraryIsOpen.get() }]);
            }),
            queue$.tracks.onChange(() => {
                updateMusicMenuItems([{ id: "savePlaylist", enabled: queue$.tracks.get().length > 0 }]);
            }),
            hotkeys$.onChange(() => {
                updateMusicMenuItems(getPlaybackShortcutPatches());
            }),
        ];

        syncMenuState();

        return () => {
            for (const unsubscribe of unsubscribeMenuState) {
                unsubscribe();
            }
        };
    }, []);

    return null;
}
