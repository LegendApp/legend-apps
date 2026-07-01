import { useEffect } from "react";
import { AutoUpdater } from "@legend-desktop/auto-updater";
import { hotkeyToMenuShortcut } from "@legend-desktop/hotkeys";
import {
    type NativeMenuAction,
    type NativeMenuConfig,
    type NativeMenuItemPatch,
    updateMenuItems,
    useNativeMenu,
} from "@legend-desktop/native-menu";
import { localAudioControls, localPlayerState$, queue$ } from "@/components/LocalAudioPlayer";
import { savePlaylistUI$ } from "@/state/savePlaylistUIState";
import { type RepeatMode, settings$ } from "@/systems/Settings";
import { state$, stateSaved$ } from "@/systems/State";
import { hotkeys$ } from "@/systems/hotkeys";
import { KeyCodes } from "@/systems/keyboard/KeyboardManager";
import { perfCount, perfLog } from "@legend-desktop/runtime-utils";

const MENU_OWNER_ID = "music";
const APP_MENU_ID = "app";
const FILE_MENU_ID = "file";
const PLAYBACK_MENU_ID = "playback";
const VIEW_MENU_ID = "view";

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
