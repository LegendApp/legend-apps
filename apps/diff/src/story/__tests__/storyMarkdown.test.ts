import { storyToMarkdown } from "../storyMarkdown";
import { fixtureInput, fixtureStory } from "./storyFixtures";

it("exports PR-friendly sections, evidence, decisions and real uncovered hunks", () => {
  const text = storyToMarkdown(fixtureStory(), fixtureInput());
  for (const expected of ["# Improve behavior", "**State:** proposed", "## Look here: A change", "Explain **why**.", "```diff", "+after", "-before",
    "## Behavior changes", "Before: Before", "Now: After", "## Evidence", "Suggested: Review the code", "## Not verified", "## Decisions", "## Not covered by the story", "second after", "generated secret"]) expect(text).toContain(expected);
});
it("exports partial refs using only the requested real lines", () => {
  const story = fixtureStory([{ hunk: "h1", side: "new", startLine: 41, endLine: 41 }]);
  const text = storyToMarkdown(story, fixtureInput()).split("## Behavior changes")[0];
  expect(text).toContain("(new 41–41)"); expect(text).toContain("+after"); expect(text).not.toContain("-before"); expect(text).not.toContain(" context");
});
it("uses fences longer than code backticks and reports complete coverage", () => {
  const story = fixtureStory([{ hunk: "h1" }, { hunk: "h2" }, { hunk: "h3" }]);
  const text = storyToMarkdown(story, fixtureInput({ text: "```sh dangerous" }));
  expect(text).toContain("````diff"); expect(text).toContain("All hunks are covered.");
});
it("drops invalid refs and lists metadata-only files", () => {
  const input = fixtureInput();
  input.files.push({ ...input.files[0], file: { ...input.files[0].file, path: "photo.png", isBinary: true }, hunks: [] });
  const text = storyToMarkdown(fixtureStory([{ hunk: "missing" }]), input);
  expect(text).not.toContain("missing"); expect(text).toContain("photo.png (modified, binary)");
});
