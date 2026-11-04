// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { CodeBlock } from "../src/code";
import { highlightCode } from "../../presentation/src/compiler/remarkCodeHighlight";

test("web code uses compiled token colors and preserves whitespace", async () => {
  const source = '  const value = "hello";\n\nvalue;\n';
  const highlighted = await highlightCode(source, "ts");
  const block = CodeBlock({ source, highlighted });
  const text = (node: React.ReactNode): string => React.Children.toArray(node).map(child => React.isValidElement<{ children?: React.ReactNode }>(child) ? text(child.props.children) : String(child)).join("");
  expect(text(block.props.children)).toBe(source);
  const spans = React.Children.toArray(block.props.children).filter(React.isValidElement<{ style: { color: string } }>);
  expect(spans.map(span => span.props.style.color)).toEqual(highlighted.tokens.map(token => token.color));
  expect(block.props.style.backgroundColor).toBe(highlighted.background);
  expect(CodeBlock({ source }).props.children[0]).toBe(source);
});
