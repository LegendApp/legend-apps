// @ts-expect-error Bun test types are not part of the application TypeScript project.
import { expect, test } from "bun:test";
import { parseCallout, parseRichFence } from "../src/richBlockSyntax";

test("GitHub callouts preserve Markdown and optional titles", () => {
  expect(parseCallout("> [!tip] Faster builds\n> Use **Debug**.\n>\n> - Reuse the cache")).toEqual({
    type: "TIP", title: "Faster builds", color: "#16a34a", body: "Use **Debug**.\n\n- Reuse the cache",
  });
  for (const type of ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]) {
    expect(parseCallout(`> [!${type}]\n> Content`)?.type).toBe(type);
  }
  expect(parseCallout("> [!UNKNOWN]\n> Content")).toBeNull();
  expect(parseCallout("> A quote\n> [!NOTE]")).toBeNull();
});

test("fences respect delimiters, lengths, indentation and trailing source", () => {
  expect(parseRichFence("```chart\n{}\n```\n")).toEqual({ language: "chart", body: "{}" });
  expect(parseRichFence("  ~~~~question\r\nid: a\r\n  ~~~~")).toEqual({ language: "question", body: "id: a" });
  expect(parseRichFence("```unknown\nhello\n```")?.language).toBe("unknown");
  for (const source of ["````chart\n{}\n```", "```chart\n{}\n~~~", "```chart\n{}", "```chart\n{}\n```\nextra"]) {
    expect(parseRichFence(source)).toBeNull();
  }
});
