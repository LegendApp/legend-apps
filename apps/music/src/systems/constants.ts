import { Platform } from "react-native";

export const SUPPORT_ACCOUNTS = false;
export const SUPPORT_PLAYLISTS = true;

export const DEBUG_ALL = false;
const DEBUG_AUDIO_LOGS_DEFAULT = false;
const DEBUG_HOTKEY_LOGS_DEFAULT = false;
const DEBUG_LOCAL_MUSIC_LOGS_DEFAULT = false;
const DEBUG_PLAYLIST_LOGS_DEFAULT = false;
const DEBUG_QUEUE_LOGS_DEFAULT = false;

export const DEBUG_AUDIO_LOGS = DEBUG_ALL || DEBUG_AUDIO_LOGS_DEFAULT;
export const DEBUG_HOTKEY_LOGS = DEBUG_ALL || DEBUG_HOTKEY_LOGS_DEFAULT;
export const DEBUG_LOCAL_MUSIC_LOGS = DEBUG_ALL || DEBUG_LOCAL_MUSIC_LOGS_DEFAULT;
export const DEBUG_PLAYLIST_LOGS = DEBUG_ALL || DEBUG_PLAYLIST_LOGS_DEFAULT;
export const DEBUG_QUEUE_LOGS = DEBUG_ALL || DEBUG_QUEUE_LOGS_DEFAULT;

export const IS_TAHOE = Platform.OS === "macos" && Platform.Version.startsWith("26.");

export const Transitions = {
    Spring: {
        type: "spring",
        bounciness: 3,
        speed: 36,
    },
} as const;
