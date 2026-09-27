import { setParagraphMarkdown, toggleCodeBlockMarkdown, toggleInlineMarkdown } from "../markdownFormatting";

describe("code fence formatting", () => {
  it.each([
    ["~~~ts\nconst value = true;\n~~~", "const value = true;"],
    ["````md\n```\nexample\n```\n````", "```\nexample\n```"],
    ["~~~~\n~~~\nstill code\n~~~~~", "~~~\nstill code"],
    ["```ts\r\ncode\r\n```", "code"],
    ["```\n```not closing\ncode\n```", "```not closing\ncode"],
    ["```ts\ncode\n\n# still code", "code\n\n# still code"],
    ["```\n```", ""],
  ])("unwraps %j without leaving fence characters", (source, expected) => {
    expect(toggleCodeBlockMarkdown(source)).toBe(expected);
  });

  it("uses a longer fence when wrapping text containing backticks", () => {
    const source = "Example:\n```ts\nconst x = 1;\n```";
    const fenced = toggleCodeBlockMarkdown(source);
    expect(fenced).toBe(`\`\`\`\`\n${source}\n\`\`\`\``);
    expect(toggleCodeBlockMarkdown(fenced)).toBe(source);
  });

  it("converts a tilde-fenced block to paragraphs", () => {
    expect(setParagraphMarkdown("~~~ts\nhello\n~~~")).toBe("hello");
  });
});

describe("inline selection formatting", () => {
  it.each(["**", "*", "_", "~~", "||"] as const)("toggles %s across paragraphs without including whitespace", (delimiter) => {
    const source = " first \n\nsecond ";
    const formatted = ` ${delimiter}first${delimiter} \n\n${delimiter}second${delimiter} `;
    expect(toggleInlineMarkdown(source, delimiter)).toBe(formatted);
    expect(toggleInlineMarkdown(formatted, delimiter)).toBe(source);
  });
  it("preserves headings, quotes, list prefixes, and code blocks", () => {
    const source = "# Heading\n\n> Quote\n\n- [x] Task\n\n1. Item\n\n```js\nconst x = 1;\n```\n\nTail";
    expect(toggleInlineMarkdown(source, "**")).toBe("# **Heading**\n\n> **Quote**\n\n- [x] **Task**\n\n1. **Item**\n\n```js\nconst x = 1;\n```\n\n**Tail**");
  });
  it("keeps tables, thematic breaks, and indented code intact", () => {
    const source = "| A | B |\n| --- | --- |\n| a | b |\n\n---\n\n    code";
    expect(toggleInlineMarkdown(source, "**")).toBe(source);
  });
  it("adds italic around bold instead of removing bold markers", () => {
    expect(toggleInlineMarkdown("**Bold**", "*")).toBe("***Bold***");
    expect(toggleInlineMarkdown("***Bold***", "*")).toBe("**Bold**");
  });
  it("preserves CRLF and existing styled paragraphs when applying to mixed content", () => {
    expect(toggleInlineMarkdown("**First**\r\n\r\nSecond", "**")).toBe("**First**\r\n\r\n**Second**");
  });
});
