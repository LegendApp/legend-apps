import { isSyntaxGrammarInstalled, warmSyntaxHighlighters } from "@legend-desktop/syntax-parser";

import { setDiffSyntaxThemeSetting } from "../diffSettings";
import { warmDiffSyntaxHighlighters } from "../diffSyntaxWarmup";

const syntaxParserMock = jest.requireMock("@legend-desktop/syntax-parser");

describe("diffSyntaxWarmup", () => {
  beforeEach(() => {
    syntaxParserMock.__resetSyntaxParserMock();
  });

  it("does not warm unavailable grammars", async () => {
    await expect(warmDiffSyntaxHighlighters(["tsx", "json"])).resolves.toEqual([]);
    expect(warmSyntaxHighlighters).not.toHaveBeenCalled();
  });

  it("warms only installed grammars with the selected theme", async () => {
    jest.mocked(isSyntaxGrammarInstalled).mockImplementation((language) => language === "tsx" || language === "json");
    setDiffSyntaxThemeSetting("github-light");

    await expect(warmDiffSyntaxHighlighters(["tsx", "typescript", "json"])).resolves.toEqual([
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
