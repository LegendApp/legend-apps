import { builtInStorySkills, changeStoryMarkdown, changeStorySkill, parseStorySkill, serializeStorySkill, SkillValidationError } from "../storySkill";
import { storyHash } from "../storyHash";

it("parses bundled prompts with frontmatter, body and exact file hash", () => {
  for (const skill of builtInStorySkills) {
    expect(parseStorySkill(skill.markdown)).toMatchObject({ name: skill.name, kind: "story", output: "story", timeout: 300, hash: storyHash(skill.markdown) });
    expect(skill.body).not.toContain("name:");
  }
  expect(builtInStorySkills.map(skill => skill.name)).toEqual(["change-story", "change-story-detailed"]);
});
it("accepts scalar YAML comments, quoted values, CRLF, BOM and optional defaults", () => {
  const text = changeStoryMarkdown.replace("name: change-story", "name: 'change-story' # default").replace("tool: auto", 'tool: "claude" # CLI').replace("organization: auto\n", "").replace("timeout: 300\n", "");
  expect(parseStorySkill(`\uFEFF${text.replace(/\n/g, "\r\n")}`)).toMatchObject({ name: "change-story", tool: "claude", organization: "auto", timeout: 300 });
});
it.each([
  ["frontmatter", "no frontmatter", "frontmatter"],
  ["missing close", "---\nname: story", "frontmatter"],
  ["name traversal", changeStoryMarkdown.replace("name: change-story", "name: ../escape"), "name:"],
  ["kind", changeStoryMarkdown.replace("kind: story", "kind: other"), "kind:"],
  ["output", changeStoryMarkdown.replace("output: story", "output: check"), "kind and output"],
  ["workflow story", changeStoryMarkdown.replace("kind: story", "kind: workflow"), "kind and output"],
  ["organization", changeStoryMarkdown.replace("organization: auto", "organization: files"), "organization:"],
  ["tool", changeStoryMarkdown.replace("tool: auto", "tool: shell"), "tool:"],
  ["token zero", changeStoryMarkdown.replace("maxDiffTokens: 120000", "maxDiffTokens: 0"), "maxDiffTokens:"],
  ["quoted tokens", changeStoryMarkdown.replace("maxDiffTokens: 120000", 'maxDiffTokens: "100"'), "maxDiffTokens:"],
  ["timeout", changeStoryMarkdown.replace("timeout: 300", "timeout: -1"), "timeout:"],
  ["timer overflow", changeStoryMarkdown.replace("timeout: 300", "timeout: 2147484"), "timeout:"],
  ["empty body", changeStoryMarkdown.slice(0, changeStoryMarkdown.indexOf("\n---\n", 4) + 5), "body:"],
  ["unknown field", changeStoryMarkdown.replace("tool: auto", "tool: auto\ncommand: bad"), "Unknown skill field: command"],
  ["duplicate", changeStoryMarkdown.replace("tool: auto", "tool: auto\ntool: claude"), "Duplicate skill field: tool"],
  ["list", changeStoryMarkdown.replace("tool: auto", "tool: [codex]"), "scalar YAML"],
  ["nested", changeStoryMarkdown.replace("tool: auto", "tool:\n  value: codex"), "Frontmatter line"],
])("reports a clear error for %s", (_label, text, message) => {
  expect(() => parseStorySkill(text)).toThrow(SkillValidationError);
  expect(() => parseStorySkill(text)).toThrow(message);
});
it.each(["check", "comments", "patch"] as const)("stores workflow skills with %s output", output => {
  expect(parseStorySkill(serializeStorySkill({ ...changeStorySkill, kind: "workflow", output }))).toMatchObject({ kind: "workflow", output });
});
it("round trips editor fields without interpreting Markdown as frontmatter", () => {
  const fields = { ...changeStorySkill, name: "custom-story", body: "# Review\n---\nKeep **detail**.\n", timeout: 10, tool: "claude" as const };
  expect(parseStorySkill(serializeStorySkill(fields))).toMatchObject({ name: fields.name, body: fields.body, timeout: 10, tool: "claude" });
});
