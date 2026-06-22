import { warmSyntaxHighlighters } from "@legend-desktop/syntax-parser";
import { getDiffSyntaxThemeSetting } from "./diffSettings";

const defaultDiffWarmupLanguages = [
  "tsx",
  "typescript",
  "javascript",
  "json",
  "yaml",
];

export function warmDiffSyntaxHighlighters(languages = defaultDiffWarmupLanguages) {
  const syntaxTheme = getDiffSyntaxThemeSetting();
  return warmSyntaxHighlighters({
    label: "DiffViewer",
    languages,
    theme: syntaxTheme,
  });
}
