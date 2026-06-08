import {
  loadUserThemeFilesSync,
  type UserThemeLoadIssue,
  type UserThemeLoadResult,
} from "@legend-desktop/theme";
import { markdownStorage } from "./markdownStorage";

export type { UserThemeLoadIssue, UserThemeLoadResult };

let cachedUserThemeLoadResult: UserThemeLoadResult | null = null;

export function getMarkdownUserThemesDirectory() {
  return markdownStorage.directory("themes");
}

export function loadMarkdownUserThemesSync({ force = false }: { force?: boolean } = {}): UserThemeLoadResult {
  if (cachedUserThemeLoadResult && !force) {
    return cachedUserThemeLoadResult;
  }

  cachedUserThemeLoadResult = loadUserThemeFilesSync({ storage: markdownStorage });
  return cachedUserThemeLoadResult;
}
