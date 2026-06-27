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

function resetSyntaxParserMock() {
  getSyntaxLanguageForPath.mockClear();
  isSyntaxGrammarInstalled.mockReset();
  isSyntaxGrammarInstalled.mockReturnValue(false);
  warmSyntaxHighlighters.mockClear();
}

module.exports = {
  __esModule: true,
  defaultSyntaxThemeName,
  getSyntaxLanguageForPath,
  getSyntaxTheme: (name) => themes.get(name) ?? themes.get(defaultSyntaxThemeName),
  isSyntaxGrammarInstalled,
  normalizeSyntaxThemeName: (value) => themes.has(value) ? value : defaultSyntaxThemeName,
  warmSyntaxHighlighters,
  __resetSyntaxParserMock: resetSyntaxParserMock,
};
