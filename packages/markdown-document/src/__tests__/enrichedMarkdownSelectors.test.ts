import { readFileSync } from "node:fs";
import path from "node:path";

function withoutComments(source: string) {
  return source.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match) =>
    match.startsWith("/") ? "" : match,
  );
}

const host = withoutComments(readFileSync(
  path.resolve(__dirname, "../../../markdown-block-editor/ios/RNMarkdownBlockEditor.mm"),
  "utf8",
));
const input = withoutComments(readFileSync(
  path.join(path.dirname(require.resolve("react-native-enriched-markdown/package.json")),
    "ios/input/EnrichedMarkdownTextInput.mm"),
  "utf8",
));
const selectors = new Set([
  ...Array.from(host.matchAll(/NSSelectorFromString\(@"([^"]+)"\)/g), (match) => match[1]),
  ...Array.from(host.matchAll(/(?:respondsToSelector:\s*|return\s+)@selector\(([^)]+)\)/g), (match) => match[1])
    .filter((selector) => selector !== "doubleValue"), // NSNumber, not the input view.
]);
const implementations = input.match(/@implementation EnrichedMarkdownTextInput\b[\s\S]*?@end/g)?.join("\n") ?? "";
const methods = Array.from(implementations.matchAll(/^-\s*\([^)]+\)\s*([^;{]+)\{/gm), (match) => {
  const labels = match[1].match(/\b\w+\s*:/g);
  return labels ? labels.map((label) => label.replace(/\s/g, "")).join("") : match[1].trim();
});

test.each([...selectors])("EnrichedMarkdownTextInput implements %s", (selector) => {
  expect(methods).toContain(selector);
});
