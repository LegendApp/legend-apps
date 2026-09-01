type SyntaxAssetsModule = typeof import("../syntaxAssets");

const validGrammarFile = (scopeName: string, displayName?: string) => ({
  displayName,
  patterns: [],
  scopeName,
});

const validThemeFile = {
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#24292e",
  },
  displayName: "GitHub Light",
  tokenColors: [],
  type: "light",
};

function loadSyntaxAssets(sourceRoot?: string): {
  storageMock: {
    __getDirectoryCreateCount: (path: string) => number;
    __getFileReadCount: (path: string) => number;
    __mockDirectoryExists: (path: string) => boolean;
    __mockFileExists: (path: string) => boolean;
    __resetMockFileSystem: () => void;
    __setMockFile: (path: string, content: string) => void;
  };
  syntaxAssets: SyntaxAssetsModule;
} {
  jest.resetModules();
  if (sourceRoot) {
    process.env.EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE = sourceRoot;
  } else {
    delete process.env.EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE;
  }

  const storageMock = require("../../jest/nativeStorageMock.cjs");
  storageMock.__resetMockFileSystem();
  const syntaxAssets = require("../syntaxAssets") as SyntaxAssetsModule;
  return { storageMock, syntaxAssets };
}

describe("syntaxAssets", () => {
  it("detects syntax languages from common file paths", () => {
    const { syntaxAssets } = loadSyntaxAssets();

    expect(syntaxAssets.getSyntaxLanguageForPath("src/App.tsx")).toBe("tsx");
    expect(syntaxAssets.getSyntaxLanguageForPath("src/App.m")).toBe("objective-c");
    expect(syntaxAssets.getSyntaxLanguageForPath("src/App.mm")).toBe("objective-cpp");
    expect(syntaxAssets.getSyntaxLanguageForPath("Dockerfile.prod")).toBe("dockerfile");
    expect(syntaxAssets.getSyntaxLanguageForPath(".yarnrc.yml")).toBe("yaml");
    expect(syntaxAssets.getSyntaxLanguageForPath("README")).toBe("");
  });

  it("parses valid theme and grammar files defensively", () => {
    const { syntaxAssets } = loadSyntaxAssets();

    expect(syntaxAssets.parseSyntaxThemeFile("github-light.json", validThemeFile)).toEqual({
      appearance: "light",
      background: "#ffffff",
      foreground: "#24292e",
      label: "GitHub Light",
      name: "github-light",
    });
    expect(syntaxAssets.parseSyntaxThemeFile("bad.json", { tokenColors: [] })).toBeNull();
    expect(syntaxAssets.parseSyntaxGrammarFile("tsx.json", validGrammarFile("source.tsx", "TSX"))).toEqual({
      label: "TSX",
      name: "tsx",
      scopeName: "source.tsx",
    });
    expect(syntaxAssets.parseSyntaxGrammarFile("bad.json", { scopeName: "source.bad" })).toBeNull();
  });

  it("loads only the requested installed theme once without creating directories", () => {
    const { storageMock, syntaxAssets } = loadSyntaxAssets();
    const themesDirectory = "/tmp/application-support/syntax-assets/themes";
    const draculaPath = `${themesDirectory}/dracula.json`;
    const otherPath = `${themesDirectory}/one-light.json`;
    storageMock.__setMockFile(draculaPath, JSON.stringify({
      ...validThemeFile,
      displayName: "Dracula",
    }));
    storageMock.__setMockFile(otherPath, JSON.stringify({
      ...validThemeFile,
      displayName: "One Light",
    }));

    expect(syntaxAssets.getSyntaxTheme("dracula").name).toBe("dracula");
    expect(syntaxAssets.getSyntaxTheme("dracula").name).toBe("dracula");
    expect(storageMock.__getFileReadCount(draculaPath)).toBe(1);
    expect(storageMock.__getFileReadCount(otherPath)).toBe(0);
    expect(storageMock.__getDirectoryCreateCount(themesDirectory)).toBe(0);

    expect(syntaxAssets.getAvailableSyntaxThemes().some((theme) => theme.name === "one-light")).toBe(true);
    expect(storageMock.__getFileReadCount(draculaPath)).toBe(1);
    expect(storageMock.__getFileReadCount(otherPath)).toBe(1);
    expect(storageMock.__getDirectoryCreateCount(themesDirectory)).toBe(0);
  });

  it("does not create an asset directory when the requested theme is missing", () => {
    const { storageMock, syntaxAssets } = loadSyntaxAssets();
    const themesDirectory = "/tmp/application-support/syntax-assets/themes";

    expect(syntaxAssets.getSyntaxTheme("missing-theme")).toEqual(syntaxAssets.getSyntaxTheme("dark-plus"));
    expect(storageMock.__mockDirectoryExists(themesDirectory)).toBe(false);
    expect(storageMock.__getDirectoryCreateCount(themesDirectory)).toBe(0);
  });

  it("treats bundled themes as installed while leaving grammars available until installed", () => {
    const { syntaxAssets } = loadSyntaxAssets();

    expect(syntaxAssets.isSyntaxThemeInstalled("dark-plus")).toBe(true);
    expect(syntaxAssets.isSyntaxThemeInstalled("github-light")).toBe(true);
    expect(syntaxAssets.normalizeSyntaxThemeName("github-light")).toBe("github-light");
    expect(syntaxAssets.normalizeSyntaxThemeName("dracula")).toBe("dark-plus");
    expect(syntaxAssets.getAvailableSyntaxGrammars().find((grammar) => grammar.name === "tsx")).toMatchObject({
      dependencies: ["javascript.json", "typescript.json", "jsx.json", "tsx.json"],
      filename: "tsx.json",
      status: "available",
    });
    expect(syntaxAssets.isSyntaxGrammarInstalled("tsx")).toBe(false);
  });

  it("installs grammar dependencies from the dev asset source on demand", async () => {
    const sourceRoot = "/tmp/syntax-source";
    const { storageMock, syntaxAssets } = loadSyntaxAssets(sourceRoot);
    for (const filename of ["javascript.json", "typescript.json", "jsx.json", "tsx.json"]) {
      storageMock.__setMockFile(
        `${sourceRoot}/grammars/${filename}`,
        JSON.stringify(validGrammarFile(`source.${filename.replace(".json", "")}`)),
      );
    }

    await syntaxAssets.ensureSyntaxGrammar("tsx");

    expect(syntaxAssets.isSyntaxGrammarInstalled("tsx")).toBe(true);
    for (const filename of ["javascript.json", "typescript.json", "jsx.json", "tsx.json"]) {
      expect(storageMock.__mockFileExists(`/tmp/application-support/syntax-assets/grammars/${filename}`)).toBe(true);
    }
    expect(syntaxAssets.getAvailableSyntaxGrammars().filter((grammar) => grammar.status === "installed").map((grammar) => grammar.filename).sort()).toEqual([
      "javascript.json",
      "jsx.json",
      "tsx.json",
      "typescript.json",
    ]);
  });

  it("installs grammars needed by changed file paths once per language", async () => {
    const sourceRoot = "/tmp/syntax-source";
    const { storageMock, syntaxAssets } = loadSyntaxAssets(sourceRoot);
    for (const filename of ["css.json", "scss.json", "yaml.json"]) {
      storageMock.__setMockFile(
        `${sourceRoot}/grammars/${filename}`,
        JSON.stringify(validGrammarFile(`source.${filename.replace(".json", "")}`)),
      );
    }

    await syntaxAssets.ensureSyntaxGrammarsForPaths([
      "src/styles.scss",
      "src/other.scss",
      ".github/workflows/test.yml",
      "README",
    ]);

    expect(syntaxAssets.isSyntaxGrammarInstalled("scss")).toBe(true);
    expect(syntaxAssets.isSyntaxGrammarInstalled("yaml")).toBe(true);
    expect(syntaxAssets.isSyntaxGrammarInstalled("markdown")).toBe(false);
  });

  it("throws a clear error when grammar downloads are not configured", async () => {
    const { syntaxAssets } = loadSyntaxAssets();

    await expect(syntaxAssets.ensureSyntaxGrammar("python")).rejects.toThrow("Syntax grammar downloads are not configured yet.");
  });

  it("installs themes from the dev asset source and keeps seeded themes non-removable", async () => {
    const sourceRoot = "/tmp/syntax-source";
    const { storageMock, syntaxAssets } = loadSyntaxAssets(sourceRoot);
    storageMock.__setMockFile(
      `${sourceRoot}/themes/dracula.json`,
      JSON.stringify({
        ...validThemeFile,
        colors: {
          "editor.background": "#282a36",
          "editor.foreground": "#f8f8f2",
        },
        displayName: "Dracula",
        type: "dark",
      }),
    );

    await syntaxAssets.ensureSyntaxTheme("dracula");

    expect(syntaxAssets.isSyntaxThemeInstalled("dracula")).toBe(true);
    expect(syntaxAssets.normalizeSyntaxThemeName("dracula")).toBe("dracula");
    expect(storageMock.__mockDirectoryExists("/tmp/application-support/syntax-assets/themes")).toBe(true);
    const installedThemeFile = "/tmp/application-support/syntax-assets/themes/dracula.json";
    expect(storageMock.__mockFileExists(installedThemeFile)).toBe(true);

    await syntaxAssets.removeSyntaxAsset("theme", "dark-plus.json");
    expect(syntaxAssets.isSyntaxThemeInstalled("dark-plus")).toBe(true);

    await syntaxAssets.removeSyntaxAsset("theme", "dracula.json");
    expect(syntaxAssets.isSyntaxThemeInstalled("dracula")).toBe(false);
    expect(storageMock.__mockFileExists(installedThemeFile)).toBe(false);
  });
});
