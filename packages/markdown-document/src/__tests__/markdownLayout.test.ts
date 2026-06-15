import {
  estimateMarkdownSelectionVerticalRange,
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
