import { readFileSync } from "node:fs";
import path from "node:path";

const ios = path.join(path.dirname(require.resolve("react-native-enriched-markdown/package.json")), "ios");

test("only the macOS same-content restyle restores the selection", () => {
  const renderer = readFileSync(path.join(ios, "EnrichedMarkdown.mm"), "utf8");
  const apply = renderer.slice(
    renderer.indexOf("- (void)applyRenderedSegments:"),
    renderer.indexOf("- (void)configureTextView:"),
  );
  const restyle = apply.match(/#if TARGET_OS_OSX\n([\s\S]*?)#endif/)?.[1] ?? "";
  const guard = restyle.match(/if \(([^{}]*)\) \{/)?.[1];

  expect(guard).toContain("[self hasRenderedMarkdown:renderedMarkdown]");
  expect(guard).toContain("[_segmentSignatures.firstObject isEqualToNumber:@(segment.signature)]");
  expect(apply.indexOf(restyle)).toBeLessThan(apply.indexOf("_renderedMarkdown ="));
  expect(restyle).toMatch(/configureTextView:[^{}]*?selectedRange = selection;\s+reset = NO;/);
  expect(apply.replace(restyle, "")).not.toContain("selectedRange");
});

test("ordinary content updates do not restore selection based on the displayed string", () => {
  // Link destinations and image sources can change without changing the displayed string.
  const textView = readFileSync(path.join(ios, "views/EnrichedMarkdownInternalText.m"), "utf8");
  expect(textView).not.toMatch(/selectedRange\s*=/);
});
