import {
  isLegendThemeFile,
  replaceUserLegendThemeFiles,
  type LegendThemeFile,
} from "@legend-desktop/theme";
import { markdownStorage } from "./markdownStorage";

export type UserThemeLoadIssue = {
  filename: string;
  message: string;
};

export type UserThemeLoadResult = {
  directoryUri: string;
  issues: UserThemeLoadIssue[];
  themes: LegendThemeFile[];
};

let cachedUserThemeLoadResult: UserThemeLoadResult | null = null;

export function getMarkdownUserThemesDirectory() {
  return markdownStorage.directory("themes");
}

export function loadMarkdownUserThemesSync({ force = false }: { force?: boolean } = {}): UserThemeLoadResult {
  if (cachedUserThemeLoadResult && !force) {
    return cachedUserThemeLoadResult;
  }

  const directory = markdownStorage.ensureDirectory("themes");
  const issues: UserThemeLoadIssue[] = [];
  const themes: LegendThemeFile[] = [];

  try {
    for (const entry of markdownStorage.list("themes", { extension: ".json" })) {
      try {
        const parsed = markdownStorage.read(`themes/${entry.name}`, { format: "json" });
        if (isLegendThemeFile(parsed)) {
          themes.push(parsed);
        } else {
          issues.push({ filename: entry.name, message: "Theme file is missing required fields or valid colors." });
        }
      } catch (error) {
        issues.push({ filename: entry.name, message: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    issues.push({ filename: directory.name, message: error instanceof Error ? error.message : String(error) });
  }

  replaceUserLegendThemeFiles(themes);
  cachedUserThemeLoadResult = { directoryUri: directory.uri, issues, themes };
  return cachedUserThemeLoadResult;
}
