const defaultSyntaxThemeName = "dark-plus";
const themes = new Map([
  [defaultSyntaxThemeName, {
    appearance: "dark",
    background: "#1E1E1E",
    foreground: "#D4D4D4",
    label: "Dark Plus",
    name: defaultSyntaxThemeName,
  }],
  ["github-light", {
    appearance: "light",
    background: "#ffffff",
    foreground: "#24292e",
    label: "GitHub Light",
    name: "github-light",
  }],
]);
const isSyntaxGrammarInstalled = jest.fn(() => false);
const getAvailableSyntaxGrammars = jest.fn(() => (
  ["tsx", "typescript", "javascript", "json", "swift"].map((name) => ({
    filename: `${name}.wasm`,
    label: name,
    name,
    status: isSyntaxGrammarInstalled(name) ? "installed" : "available",
  }))
));
const getSyntaxLanguageForPath = jest.fn((path) => {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "tsx" || extension === "ts" || extension === "js" || extension === "json" || extension === "swift") {
    return extension === "ts" ? "typescript" : extension === "js" ? "javascript" : extension;
  }
  return "";
});

const warmSyntaxHighlighters = jest.fn(async ({ languages }) => (
  languages.map((language) => ({ language, ms: 1, ok: true }))
));
const highlightString = jest.fn(async (source) => ({
  lines: source.split("\n").map((text, index) => ({ index, text, tokens: [] })),
  styles: [],
  timing: {
    colorCount: 0,
    contextMs: 0,
    indexLinesMs: 0,
    initialLinesMs: 0,
    lineCount: source.length === 0 ? 0 : source.split("\n").length,
    mapFileMs: 0,
    nativeTotalMs: 0,
    tokenCount: 0,
    tokenizeMs: 0,
    totalMs: 0,
  },
}));

function resetSyntaxParserMock() {
  getSyntaxLanguageForPath.mockClear();
  getAvailableSyntaxGrammars.mockClear();
  isSyntaxGrammarInstalled.mockReset();
  isSyntaxGrammarInstalled.mockReturnValue(false);
  highlightString.mockClear();
  warmSyntaxHighlighters.mockClear();
}

module.exports = {
  __esModule: true,
  defaultSyntaxThemeName,
  getAvailableSyntaxGrammars,
  getSyntaxLanguageForPath,
  getSyntaxTheme: (name) => themes.get(name) ?? themes.get(defaultSyntaxThemeName),
  highlightString,
  isSyntaxGrammarInstalled,
  normalizeSyntaxThemeName: (value) => themes.has(value) ? value : defaultSyntaxThemeName,
  warmSyntaxHighlighters,
  __resetSyntaxParserMock: resetSyntaxParserMock,
};
