import {
    loadUserThemeFilesSync,
    type UserThemeLoadIssue,
    type UserThemeLoadResult,
} from "@legend-desktop/theme";
import { musicStorage } from "@/musicStorage";

export type { UserThemeLoadIssue, UserThemeLoadResult };

let cachedUserThemeLoadResult: UserThemeLoadResult | null = null;

export function getMusicUserThemesDirectory() {
    return musicStorage.directory("themes");
}

export function loadMusicUserThemesSync({ force = false }: { force?: boolean } = {}): UserThemeLoadResult {
    if (cachedUserThemeLoadResult && !force) {
        return cachedUserThemeLoadResult;
    }

    cachedUserThemeLoadResult = loadUserThemeFilesSync({ storage: musicStorage });
    return cachedUserThemeLoadResult;
}
