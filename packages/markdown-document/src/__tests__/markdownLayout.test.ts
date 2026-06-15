import {
  estimateMarkdownSelectionVerticalRange,
  isMarkdownSelectionOnFirstLine,
  isMarkdownSelectionOnLastLine,
} from "../markdownLayout";

describe("estimateMarkdownSelectionVerticalRange", () => {
  it("estimates the selected line inside a padded code block", () => {
    const markdown = "```\nalpha\nbeta\ngamma\n```";
    const range = estimateMarkdownSelectionVerticalRange(
      markdown,
      "```\nalpha\nbeta".length,
      700,
      { fontSize: 13, lineHeight: 21.45, padding: 20 },
    );

    expect(range.top).toBeCloseTo(20 + 2 * 21.45);
    expect(range.bottom).toBeCloseTo(20 + 3 * 21.45);
  });

  it("accounts for wrapped visual lines before the selection", () => {
    const markdown = "1234567890abcdefghij\nselected";
    const range = estimateMarkdownSelectionVerticalRange(
      markdown,
      markdown.indexOf("selected"),
      100,
      { fontSize: 10, lineHeight: 20 },
    );

    expect(range.top).toBe(40);
    expect(range.bottom).toBe(60);
  });
});

describe("markdown selection line boundaries", () => {
  it("detects whether a collapsed selection is on the first line", () => {
    const markdown = "first\nsecond\nthird";

    expect(isMarkdownSelectionOnFirstLine(markdown, { start: 2, end: 2 })).toBe(true);
    expect(isMarkdownSelectionOnFirstLine(markdown, { start: "first".length, end: "first".length })).toBe(true);
    expect(isMarkdownSelectionOnFirstLine(markdown, { start: "first\ns".length, end: "first\ns".length })).toBe(false);
    expect(isMarkdownSelectionOnFirstLine(markdown, { start: 0, end: 5 })).toBe(false);
  });

  it("detects whether a collapsed selection is on the last line", () => {
    const markdown = "first\nsecond\nthird";

    expect(isMarkdownSelectionOnLastLine(markdown, { start: "first\nsecond\nth".length, end: "first\nsecond\nth".length })).toBe(true);
    expect(isMarkdownSelectionOnLastLine(markdown, { start: "first".length, end: "first".length })).toBe(false);
    expect(isMarkdownSelectionOnLastLine(markdown, { start: "first\nsecond".length, end: "first\nsecond".length })).toBe(false);
    expect(isMarkdownSelectionOnLastLine(markdown, { start: markdown.length - 2, end: markdown.length })).toBe(false);
  });
});
