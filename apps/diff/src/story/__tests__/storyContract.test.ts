import { extractStoryJSON, validateStory } from "../storyContract";
import { fixtureInput, fixtureStory } from "./storyFixtures";

const input = fixtureInput();
it("validates a story and computes uncovered hunks grouped by file", () => {
  expect(validateStory(fixtureStory(), input.hunks)).toMatchObject({ issues: [], coveredHunkIds: ["h1"],
    uncovered: [{ file: "src/a.ts", hunkIds: ["h2"] }, { file: "generated/api.ts", hunkIds: ["h3"] }] });
});
it("drops unknown and out-of-range refs, retaining valid duplicates and counting coverage once", () => {
  const result = validateStory(fixtureStory([{ hunk: "h1" }, { hunk: "nope" }, { hunk: "h2", side: "old", startLine: 1, endLine: 900 },
    { hunk: "h1", side: "new", startLine: 40, endLine: 41 }, { hunk: "h1" }]), input.hunks);
  expect(result.story.sections[0].refs).toHaveLength(3);
  expect(result.coveredHunkIds).toEqual(["h1"]);
  expect(result.issues.map(issue => issue.message)).toEqual(["Unknown hunk ID: nope", expect.stringContaining("Line range outside")]);
  expect(result.uncovered.flatMap(group => group.hunkIds)).toEqual(["h2", "h3"]);
});
it.each([
  { hunk: "h1", side: "old" as const }, { hunk: "h1", startLine: 40, endLine: 40 },
  { hunk: "h1", side: "new" as const, startLine: 41, endLine: 40 }, { hunk: "h1", side: "old" as const, startLine: 40, endLine: 42 },
])("drops incomplete or invalid line ranges %#", ref => {
  const result = validateStory(fixtureStory([ref]), input.hunks);
  expect(result.issues).toHaveLength(1);
  expect(result.coveredHunkIds).toEqual([]);
});
it("counts references across sections and reports full coverage", () => {
  const story = fixtureStory([{ hunk: "h1" }, { hunk: "h2" }, { hunk: "h3" }]);
  story.sections.push({ ...story.sections[0], id: "s2", refs: [{ hunk: "h1" }] });
  expect(validateStory(story, input.hunks).uncovered).toEqual([]);
});
it.each([
  { title: 1 }, { contractVersion: 2 }, { risk: { level: "huge", reason: "why" } }, { title: " " }, { sections: null },
  { evidence: [{ text: "test", ran: "yes" }] }, { extra: "untrusted" }, { sections: [{ id: "s1", title: "s", description: "", refs: [{ hunk: "h1", startLine: 1.5 }] }] },
])("rejects schema errors %#", changes => expect(() => validateStory({ ...fixtureStory(), ...changes }, input.hunks)).toThrow());
it("rejects duplicate section IDs without rejecting duplicate hunk refs", () => {
  const story = fixtureStory(); story.sections.push(story.sections[0]);
  expect(() => validateStory(story, input.hunks)).toThrow("Duplicate section ID");
});
it.each([
  (json: string) => json, (json: string) => `\`\`\`json\n${json}\n\`\`\``, (json: string) => `Output:\n${json}\nFinished.`,
  (json: string) => `prose {not json} here\n${json}`, (json: string) => `\`\`\`\n${json}\n\`\`\``,
])("extracts bare and fenced JSON with surrounding prose %#", wrap => {
  const story = fixtureStory(); story.sections[0].description = 'Braces { and } and escaped "quotes" \\ slashes';
  expect(extractStoryJSON(wrap(JSON.stringify(story)))).toEqual(story);
});
it.each(["", "not JSON", '{"kind":"story",', "```json\n{}\n```"])("reports invalid JSON: %s", output => expect(() => extractStoryJSON(output)).toThrow("No valid story JSON"));
