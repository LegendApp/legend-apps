import { observable } from "@legendapp/state";
import { createObservableFile } from "@legend-apps/storage";

type SettingsPage = "account" | "general" | "library" | "overlay" | "theme" | "ui-customize" | "open-source";

export const state$ = observable({
    isDropdownOpen: false,
    activeSubmenuId: null as string | null,
    lastNavStart: 0,
    lastNavTime: 0,
    titleBarHovered: false,
    showSettings: false,
    showSettingsPage: undefined as SettingsPage | undefined,
    songId: undefined as string | undefined,
    listeningForKeyPress: false,
    isWindowHovered: false,
});

type SavedState = {
    playlist: string | undefined;
    playlistType: "file" | "url";
    libraryIsOpen: boolean;
    libraryWindowSize: { width: number; height: number };
    playbackIndex: number;
    playbackTime: number;
};

export const stateSaved$ = createObservableFile<SavedState>({
    filename: "state",
    initialValue: {
        playlist: undefined as string | undefined,
        playlistType: "file" as const,
        libraryIsOpen: false,
        libraryWindowSize: { width: 0, height: 0 },
        playbackIndex: -1,
        playbackTime: 0,
    },
    subfolder: "data",
});
