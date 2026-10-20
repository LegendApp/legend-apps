import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MarkdownBlockRenderer } from "../../../markdown-block-editor/src/MarkdownBlockRenderer";

jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "Symbol" }));
jest.mock("../../../markdown-block-editor/src/MarkdownChart", () => ({ MarkdownChart: "Chart" }));
jest.mock("../../../markdown-block-editor/src/MarkdownMermaid", () => ({ MarkdownMermaid: "Diagram" }));

const question = "```question\nid: choice\nprompt: Pick\noptions: [One, Two]\n```";
const sources = [
  "> [!NOTE] Note\n> Details",
  question,
  "```mermaid\ngraph TD; A-->B\n```",
  '```chart\n{"type":"bar","x":["Mon"],"series":[{"name":"a","data":[1]}]}\n```',
];

it.each(sources)("rich block selects on click and exposes a pencil on hover or selection: %s", async (sourceMarkdown) => {
  const onEditSource = jest.fn();
  const onSelect = jest.fn();
  const props = { blockId: "b0", sourceMarkdown, onEditSource, onSelect, onQuestionAnswer: jest.fn() };
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<MarkdownBlockRenderer {...props} />); });
  const pencil = () => renderer.root.findAll(node => String(node.type) === "Pressable" && node.props.accessibilityLabel === "Edit block source")[0];
  const frame = () => renderer.root.findAll(node => String(node.type) === "Pressable" && node.props.testID === "markdown-rich-block-b0")[0];
  expect(pencil()).toBeDefined();
  expect(pencil().props.style.opacity).toBe(0);
  await act(async () => frame().props.onHoverIn());
  expect(pencil().props.style.opacity).toBe(1);
  await act(async () => frame().props.onPress());
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onEditSource).not.toHaveBeenCalled();
  await act(async () => pencil().props.onPress({ stopPropagation: jest.fn() }));
  expect(onEditSource).toHaveBeenCalledTimes(1);
  await act(async () => { frame().props.onHoverOut(); renderer.update(<MarkdownBlockRenderer {...props} selected />); });
  expect(pencil().props.style.opacity).toBe(1);
  await act(async () => renderer.unmount());
});

it("rich block question options and saving do not open source", async () => {
  const onEditSource = jest.fn();
  const onQuestionAnswer = jest.fn(async () => undefined);
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<MarkdownBlockRenderer blockId="b0" sourceMarkdown={question} onEditSource={onEditSource} onQuestionAnswer={onQuestionAnswer} />); });
  const presses = () => renderer.root.findAll(node => String(node.type) === "Pressable");
  await act(async () => presses().find(node => node.props.accessibilityRole === "radio")!.props.onPress());
  await act(async () => presses().find(node => node.props.accessibilityRole === "button" && node.props.accessibilityLabel !== "Edit block source" && node.findAll(child => String(child.type) === "Text" && child.props.children === "Save answer").length)!.props.onPress());
  expect(onQuestionAnswer).toHaveBeenCalledWith("choice", "One");
  expect(onEditSource).not.toHaveBeenCalled();
  await act(async () => renderer.unmount());
});

it.each(["```unknown\nhello\n```", "```chart\n{}\n```", "```question\nid: invalid\n```"])("invalid rich block keeps code without pencil: %s", async (sourceMarkdown) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<MarkdownBlockRenderer blockId="b0" sourceMarkdown={sourceMarkdown} />); });
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === "Edit block source")).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.nativeMarkdownBlockId === "b0").length).toBeGreaterThan(0);
  await act(async () => renderer.unmount());
});

it.each(["Chart", "Diagram"])("rich block renderer failure restores code without pencil: %s", async (type) => {
  const onRenderError = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<MarkdownBlockRenderer blockId="b0" sourceMarkdown={sources[type === "Chart" ? 3 : 2]} onRenderError={onRenderError} />); });
  await act(async () => renderer.root.findByType(type as React.ElementType).props.onError("Invalid input"));
  expect(onRenderError).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAll(node => node.props.accessibilityLabel === "Edit block source")).toHaveLength(0);
  expect(renderer.root.findAll(node => node.props.nativeMarkdownBlockId === "b0").length).toBeGreaterThan(0);
  await act(async () => renderer.unmount());
});
