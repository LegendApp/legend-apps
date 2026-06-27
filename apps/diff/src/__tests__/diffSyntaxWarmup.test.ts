import { isSyntaxGrammarInstalled, warmSyntaxHighlighters } from "@legend-desktop/syntax-parser";

import {
  getDiffSyntaxPrewarmKnownLanguagesSetting,
  getDiffSyntaxPrewarmLanguagesSetting,
  setDiffSyntaxHighlightingEnabledSetting,
  setDiffSyntaxPrewarmEnabledSetting,
  setDiffSyntaxPrewarmKnownLanguagesSetting,
  setDiffSyntaxPrewarmLanguagesSetting,
  setDiffSyntaxThemeSetting,
} from "../diffSettings";
import {
  getDiffWarmupLanguagesForPaths,
  recordDiffSyntaxLanguagesForPaths,
  warmDiffSyntaxHighlightersForStartup,
} from "../diffSyntaxWarmup";

const syntaxParserMock = jest.requireMock("@legend-desktop/syntax-parser");

describe("diffSyntaxWarmup", () => {
  beforeEach(() => {
    syntaxParserMock.__resetSyntaxParserMock();
    jest.mocked(warmSyntaxHighlighters).mockClear();
    setDiffSyntaxHighlightingEnabledSetting(true);
    setDiffSyntaxPrewarmEnabledSetting(true);
    setDiffSyntaxPrewarmKnownLanguagesSetting([]);
    setDiffSyntaxPrewarmLanguagesSetting([]);
    setDiffSyntaxThemeSetting("dark-plus");
  });

  it("does not warm without enabled learned languages", async () => {
    await expect(warmDiffSyntaxHighlightersForStartup()).resolves.toEqual([]);
    expect(warmSyntaxHighlighters).not.toHaveBeenCalled();
  });

  it("finds unique installed warmup languages from file paths", () => {
    jest.mocked(isSyntaxGrammarInstalled).mockImplementation((language) => language === "tsx" || language === "json");

    expect(getDiffWarmupLanguagesForPaths([
      "App.tsx",
      "components/Button.tsx",
      "package.json",
      "README.md",
    ])).toEqual(["tsx", "json"]);
  });

  it("records newly encountered installed languages as enabled for startup prewarm", () => {
    jest.mocked(isSyntaxGrammarInstalled).mockImplementation((language) => language === "tsx" || language === "json");

    expect(recordDiffSyntaxLanguagesForPaths(["App.tsx", "state.ts", "package.json"])).toEqual(["tsx", "json"]);
    expect(getDiffSyntaxPrewarmKnownLanguagesSetting()).toEqual(["json", "tsx"]);
    expect(getDiffSyntaxPrewarmLanguagesSetting()).toEqual(["json", "tsx"]);
  });

  it("warms enabled learned languages with the selected theme", async () => {
    jest.mocked(isSyntaxGrammarInstalled).mockImplementation((language) => language === "tsx" || language === "json");
    setDiffSyntaxPrewarmKnownLanguagesSetting(["json", "tsx"]);
    setDiffSyntaxPrewarmLanguagesSetting(["tsx", "json"]);
    setDiffSyntaxThemeSetting("github-light");

    await expect(warmDiffSyntaxHighlightersForStartup()).resolves.toEqual([
      { language: "json", ms: 1, ok: true },
      { language: "tsx", ms: 1, ok: true },
    ]);

    expect(warmSyntaxHighlighters).toHaveBeenCalledWith({
      label: "DiffStartup",
      languages: ["json", "tsx"],
      theme: "github-light",
    });
  });

  it("does not warm when syntax highlighting or prewarm is disabled", async () => {
    jest.mocked(isSyntaxGrammarInstalled).mockReturnValue(true);
    setDiffSyntaxPrewarmLanguagesSetting(["tsx"]);

    setDiffSyntaxHighlightingEnabledSetting(false);
    await expect(warmDiffSyntaxHighlightersForStartup()).resolves.toEqual([]);

    setDiffSyntaxHighlightingEnabledSetting(true);
    setDiffSyntaxPrewarmEnabledSetting(false);
    await expect(warmDiffSyntaxHighlightersForStartup()).resolves.toEqual([]);

    expect(warmSyntaxHighlighters).not.toHaveBeenCalled();
  });
});
