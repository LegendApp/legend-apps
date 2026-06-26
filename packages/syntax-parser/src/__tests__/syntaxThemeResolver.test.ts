function loadResolver(themeFile: unknown) {
  jest.resetModules();
  jest.doMock("../syntaxAssets", () => ({
    __esModule: true,
    getSyntaxTheme: jest.fn(() => ({
      appearance: "dark",
      background: "#111111",
      foreground: "#cccccc",
      label: "Mock Theme",
      name: "mock-theme",
    })),
    getSyntaxThemeFile: jest.fn(() => themeFile),
    normalizeSyntaxThemeName: jest.fn((name: string) => name),
  }));

  return require("../syntaxThemeResolver") as typeof import("../syntaxThemeResolver");
}

describe("syntaxThemeResolver", () => {
  it("resolves foreground and font style from token color rules", () => {
    const { resolveSyntaxScopeStyles } = loadResolver({
      tokenColors: [
        {
          scope: "source.tsx",
          settings: { foreground: "#111111" },
        },
        {
          scope: "keyword.control",
          settings: { fontStyle: "italic" },
        },
        {
          scope: "source.tsx keyword.control",
          settings: { foreground: "#ff0000" },
        },
      ],
    });

    expect(resolveSyntaxScopeStyles("mock-theme", [{
      id: 7,
      scopes: ["source.tsx", "keyword.control.ts"],
    }])).toEqual([{
      fontStyle: 1,
      foreground: "#ff0000",
      id: 7,
    }]);
  });

  it("falls back to the theme foreground when no foreground rule matches", () => {
    const { resolveSyntaxScopeStyles } = loadResolver({
      tokenColors: [{
        scope: "entity.name",
        settings: { fontStyle: "bold" },
      }],
    });

    expect(resolveSyntaxScopeStyles("mock-theme", [{
      id: 2,
      scopes: ["source.tsx", "entity.name.function.ts"],
    }])).toEqual([{
      fontStyle: 2,
      foreground: "#cccccc",
      id: 2,
    }]);
  });
});
