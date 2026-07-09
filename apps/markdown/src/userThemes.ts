import {
  loadUserDisplayThemeFilesSync,
  loadUserMarkdownLayoutThemeFilesSync,
  type UserThemeLoadIssue,
  type UserDisplayThemeLoadResult,
  type UserMarkdownLayoutThemeLoadResult,
} from "@legend-apps/theme";
import { markdownStorage } from "./markdownStorage";

export type { UserThemeLoadIssue, UserDisplayThemeLoadResult, UserMarkdownLayoutThemeLoadResult };

export type MarkdownUserThemeLoadResult = {
  displayThemes: UserDisplayThemeLoadResult;
  layoutThemes: UserMarkdownLayoutThemeLoadResult;
};

let cachedUserThemeLoadResult: MarkdownUserThemeLoadResult | null = null;

export function getMarkdownUserThemesDirectory(kind: "display" | "layout") {
  return markdownStorage.directory(`themes/${kind}`);
}

export function loadMarkdownUserThemesSync({ force = false }: { force?: boolean } = {}): MarkdownUserThemeLoadResult {
  if (cachedUserThemeLoadResult && !force) {
    return cachedUserThemeLoadResult;
  }

  cachedUserThemeLoadResult = {
    displayThemes: loadUserDisplayThemeFilesSync({
      directory: "themes/display",
      storage: markdownStorage,
    }),
    layoutThemes: loadUserMarkdownLayoutThemeFilesSync({
      directory: "themes/layout",
      storage: markdownStorage,
    }),
  };
  return cachedUserThemeLoadResult;
}
