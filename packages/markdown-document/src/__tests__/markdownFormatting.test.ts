import { setParagraphMarkdown, toggleCodeBlockMarkdown } from "../markdownFormatting";

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
