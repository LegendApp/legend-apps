// @ts-expect-error Bun test types are not part of the application TypeScript project.
import { expect, mock, test } from "bun:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";

mock.module("react-native", () => ({ Pressable: "Pressable", Text: "Text", View: "View", TextInput: "TextInput" }));
mock.module("react-native-enriched-markdown", () => ({ EnrichedMarkdownText: "Code" }));
mock.module("../src/MarkdownMermaid", () => ({ MarkdownMermaid: "Diagram" }));
mock.module("../src/MarkdownChart", () => ({ MarkdownChart: "Chart" }));
const { MarkdownBlockRenderer } = await import("../src/MarkdownBlockRenderer");

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return isValidElement<Record<string, unknown>>(node)
    ? [node, ...Children.toArray(node.props.children as ReactNode).flatMap(elements)]
    : [];
}

function render(sourceMarkdown: string, getQuestionError?: (id: string) => string | undefined) {
  return MarkdownBlockRenderer({ blockId: "doc:b0", renderRevision: 7, sourceMarkdown, getQuestionError });
}

function expectCode(node: ReactNode) {
  const code = elements(node).find(element => element.type === "Code");
  expect(code?.props.nativeMarkdownBlockId).toBe("doc:b0");
  expect(code?.props.nativeMarkdownRevision).toBe(7);
}

test("unknown fences and callouts keep the native source renderer", () => {
  for (const source of ["```unknown\nhello\n```", "> [!UNKNOWN]\n> hello"]) {
    const node = render(source);
    expectCode(node);
    expect(elements(node).some(element => element.props.message)).toBe(false);
  }
});

test("invalid chart bodies keep source plus one descriptive error", () => {
  const node = render('```chart\n{"type":"bar","x":["Mon","Tue"],"series":[{"name":"a","data":[1]}]}\n```');
  expectCode(node);
  expect(elements(node).filter(element => element.props.message).map(element => element.props.message))
    .toEqual(["Invalid chart: series[0].data length 1 ≠ x length 2"]);
});

test("invalid and duplicate questions keep source plus the validation error", () => {
  const invalid = render("```question\nid: a\n```");
  expectCode(invalid);
  expect(elements(invalid).some(element => element.props.message === "Invalid question: prompt must be a non-empty string")).toBe(true);
  const duplicate = render("```question\nid: a\nprompt: Pick\noptions: [One, Two]\n```", () => "Question id must be unique: a");
  expectCode(duplicate);
  expect(elements(duplicate).some(element => element.props.message === "Invalid question: Question id must be unique: a")).toBe(true);
});

test("callout body renders its Markdown without replacing the source block", () => {
  const node = render("> [!NOTE] Details\n> **Bold** and [link](https://example.com)");
  const body = elements(node).find(element => element.type === "Code");
  expect(body?.props.markdown).toBe("**Bold** and [link](https://example.com)");
  expect(body?.props.nativeMarkdownBlockId).toBeUndefined();
  expect(elements(node).some(element => element.props.children === "Details")).toBe(true);
});
