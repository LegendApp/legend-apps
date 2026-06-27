import { isSyntaxGrammarInstalled, warmSyntaxHighlighters } from "@legend-desktop/syntax-parser";

import { setDiffSyntaxThemeSetting } from "../diffSettings";
import { getDiffWarmupLanguagesForPaths, warmDiffSyntaxHighlightersForPaths } from "../diffSyntaxWarmup";

const syntaxParserMock = jest.requireMock("@legend-desktop/syntax-parser");

describe("diffSyntaxWarmup", () => {
  beforeEach(() => {
    syntaxParserMock.__resetSyntaxParserMock();
  });

  it("does not warm unavailable grammars", async () => {
    await expect(warmDiffSyntaxHighlightersForPaths(["App.tsx", "package.json"])).resolves.toEqual([]);
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

  it("warms only installed path languages with the selected theme", async () => {
    jest.mocked(isSyntaxGrammarInstalled).mockImplementation((language) => language === "tsx" || language === "json");
    setDiffSyntaxThemeSetting("github-light");

    await expect(warmDiffSyntaxHighlightersForPaths(["App.tsx", "state.ts", "package.json"])).resolves.toEqual([
      { language: "tsx", ms: 1, ok: true },
      { language: "json", ms: 1, ok: true },
    ]);

    expect(warmSyntaxHighlighters).toHaveBeenCalledWith({
      label: "DiffViewer",
      languages: ["tsx", "json"],
      theme: "github-light",
    });
  });
});
