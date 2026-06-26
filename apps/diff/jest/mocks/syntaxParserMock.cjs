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

const warmSyntaxHighlighters = jest.fn(async ({ languages }) => (
  languages.map((language) => ({ language, ms: 1, ok: true }))
));

function resetSyntaxParserMock() {
  isSyntaxGrammarInstalled.mockReset();
  isSyntaxGrammarInstalled.mockReturnValue(false);
  warmSyntaxHighlighters.mockClear();
}

module.exports = {
  __esModule: true,
  defaultSyntaxThemeName,
  getSyntaxTheme: (name) => themes.get(name) ?? themes.get(defaultSyntaxThemeName),
  isSyntaxGrammarInstalled,
  normalizeSyntaxThemeName: (value) => themes.has(value) ? value : defaultSyntaxThemeName,
  warmSyntaxHighlighters,
  __resetSyntaxParserMock: resetSyntaxParserMock,
};
