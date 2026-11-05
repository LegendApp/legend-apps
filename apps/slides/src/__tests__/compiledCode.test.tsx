import "./nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { CodeBlock } from "../CodeBlock";
import type { CodeHighlight } from "@legend-apps/presentation";

const source = '  const value = "hello";\n\nvalue;\n';
const highlighted: CodeHighlight = { version: "test", foreground: "#eeeeee", background: "#111111", tokens: [
  { content: "  const ", offset: 0, color: "#ff0000", id: "keyword:0" },
  { content: 'value = "hello";', offset: 8, color: "#00ff00", id: "value:0" },
  { content: "value;", offset: 26, color: "#0000ff", id: "value:1" },
] };
test("2D code renders compiled colors and keeps blank lines, indentation and trailing newlines", async () => {
  let renderer!: ReturnType<typeof create>;
  await act(() => { renderer = create(<CodeBlock source={source} highlighted={highlighted} />); });
  const spans = renderer.root.findAllByType("text" as never).filter(node => node.props.style?.color && !Array.isArray(node.props.style));
  expect(spans.map(node => node.props.style.color)).toEqual(highlighted.tokens.map(token => token.color));
  const text = (node: ReturnType<typeof renderer.toJSON> | string): string => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node?.children?.map(text).join("") ?? "";
  expect(text(renderer.toJSON())).toBe(source);
  await act(() => renderer.update(<CodeBlock source="" />));
  expect(text(renderer.toJSON())).toBe("\u200b");
  await act(() => renderer.unmount());
});

test("2D code refuses nonempty code without compiler highlighting", () => {
  expect(() => CodeBlock({ source: "const value = 1;" })).toThrow("require compiler syntax highlighting");
  expect(() => CodeBlock({ source: "x", highlighted: { ...highlighted, tokens: [] } })).toThrow("require compiler syntax highlighting");
});
