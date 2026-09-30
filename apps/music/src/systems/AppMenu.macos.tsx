import { useEffect, useState } from "react";
import { getUpdateStatus, configureUpdates, startUpdates, checkForUpdates } from "@legendapp/spark/updates";
import { useValue } from "@legendapp/state/react";
import {
    type MenuAction,
    type MenuItem,
    useMenu,
} from "@legendapp/spark/menus";
import { localAudioControls, localPlayerState$, queue$ } from "../components/LocalAudioPlayer";
import { savePlaylistUI$ } from "../state/savePlaylistUIState";
import { type RepeatMode, settings$ } from "./Settings";
import { state$, stateSaved$ } from "./State";
import { hotkeys$ } from "./hotkeys";
import { KeyCodes } from "./keyboard/KeyboardManager";
import { perfCount, perfLog } from "@legend-apps/runtime-utils";

const MENU_OWNER_ID = "music";
const APP_MENU_ID = "app";
const FILE_MENU_ID = "file";
const PLAYBACK_MENU_ID = "playback";
const VIEW_MENU_ID = "view";

const MENU_CONFIG: MenuItem[] = [
    { type: "submenu",
        id: APP_MENU_ID,
        label: "Legend Music",
        target: { menu: "app" },
        items: [
            { type: "action",
                id: "settings",
                target: { role: "settings" }, label: "Settings…",
            },
            { type: "action",
                id: "checkForUpdates",
                label: "Check for Updates...",
            },
        ],
    },
    { type: "submenu",
        id: FILE_MENU_ID,
        label: "File",
        items: [
            { type: "action",
                id: "savePlaylist",
                label: "Save Playlist",
                target: { role: "save" },
            },
            { type: "action",
                id: "jump",
                label: "Jump",
                shortcut: "Cmd+j",
            },
        ],
    },
    { type: "submenu",
        id: VIEW_MENU_ID,
        label: "View",
        items: [
            { type: "action",
                id: "toggleLibrary",
                label: "Media Library",
            },
        ],
    },
    { type: "submenu",
        id: PLAYBACK_MENU_ID,
        label: "Playback",
        placement: { before: { menu: "window" } },
        items: [
            { type: "action",
                id: "playbackPrevious",
                label: "Previous Track",
            },
            { type: "action",
                id: "playbackPlayPause",
                label: "Play",
            },
            { type: "action",
                id: "playbackNext",
                label: "Next Track",
            },
            { type: "separator" },
            { type: "action",
                id: "playbackToggleShuffle",
                label: "Shuffle",
            },
            { type: "action",
                id: "playbackToggleRepeat",
                label: "Repeat Off",
            },
        ],
    },
];

function toggleLibraryWindow() {
    const current = stateSaved$.libraryIsOpen.get();
    stateSaved$.libraryIsOpen.set(!current);
}

function handleMenuAction(action: MenuAction) {
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
            void checkForUpdates().catch(console.error);
            break;
        default:
            break;
    }
}

export function AppMenuController() {
    const [canUpdate, setCanUpdate] = useState(false);
    useEffect(() => {
        let active = true;
        if (!__DEV__) void getUpdateStatus().then(async status => {
            if (!active || !status.available) return;
            await configureUpdates({ automaticallyChecks: true, checkIntervalSeconds: 86400 });
            if (!active) return;
            await startUpdates();
            if (active) setCanUpdate(true);
        }).catch(console.error);
        return () => { active = false; };
    }, []);
    const items = useValue(() => {
        const shuffle = settings$.playback.shuffle.get();
        const repeat = settings$.playback.repeatMode.get();
        const playing = localPlayerState$.isPlaying.get();
        const libraryOpen = stateSaved$.libraryIsOpen.get();
        const hasTracks = queue$.tracks.get().length > 0;
        const hotkeys = hotkeys$.get();
        const bindings = { playbackPrevious: hotkeys.PreviousTrack, playbackPlayPause: hotkeys.PlayPause,
            playbackNext: hotkeys.NextTrack, playbackToggleShuffle: hotkeys.ToggleShuffle, playbackToggleRepeat: hotkeys.ToggleRepeatMode };
        return MENU_CONFIG.map(menu => menu.type !== "submenu" ? menu : { ...menu, items: menu.items.map((item): MenuItem => {
            if (item.type !== "action" && item.type !== "checkbox") return item;
            const shortcut = bindings[item.id as keyof typeof bindings]?.find(value => /^(Cmd|CmdOrCtrl|Ctrl|Alt|Shift)\+/.test(value));
            if (item.id === "playbackToggleShuffle") return { ...item, type: "checkbox", checked: !!shuffle, shortcut };
            if (item.id === "playbackToggleRepeat") return { ...item, type: "checkbox", checked: repeat !== "off", label: repeat === "all" ? "Repeat All" : repeat === "one" ? "Repeat One" : "Repeat Off", shortcut };
            if (item.id === "toggleLibrary") return { ...item, type: "checkbox", checked: !!libraryOpen };
            if (item.id === "savePlaylist") return { ...item, disabled: !hasTracks };
            if (item.id === "playbackPlayPause") return { ...item, label: playing ? "Pause" : "Play", shortcut };
            if (item.id === "checkForUpdates") return { ...item, disabled: !canUpdate };
            return item.type === "action" || item.type === "checkbox" ? { ...item, shortcut: shortcut ?? item.shortcut } : item;
        }) });
    });
    useMenu({ id: MENU_OWNER_ID, items, onAction: handleMenuAction, onError: console.error });
    return null;
}
