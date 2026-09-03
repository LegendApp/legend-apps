// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import { getCodeLanguage, getCodeSource } from "../codeBlocks";

describe("slide code blocks", () => {
  test("extracts supported fenced-code languages", () => {
    expect(getCodeLanguage("language-tsx")).toBe("tsx");
    expect(getCodeLanguage("foo language-TypeScript bar")).toBe("typescript");
    expect(getCodeLanguage("language-unknown")).toBeUndefined();
  });

  test("normalizes MDX code children", () => {
    expect(getCodeSource("const value = 42;\n")).toBe("const value = 42;");
    expect(getCodeSource(["const ", "value = ", 42, ";\n"])).toBe("const value = 42;");
    expect(getCodeSource({ type: "Text" })).toBeUndefined();
  });
});
