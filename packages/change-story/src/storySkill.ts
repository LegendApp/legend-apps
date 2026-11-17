import { storyHash } from "./storyHash";
import { storyInputContext, type StoryInput } from "./storyHunks";

export type StorySkill = {
  name: string; kind: "story" | "workflow"; output: "story" | "check" | "comments" | "patch";
  organization: "auto" | "concepts" | "commits"; tool: "auto" | "codex" | "claude";
  maxDiffTokens: number; timeout: number; markdown: string; body: string; hash: string;
  layer?: "built-in" | "user" | "repo"; path?: string; repoRoot?: string;
};
export type SkillFields = Pick<StorySkill, "name" | "kind" | "output" | "organization" | "tool" | "maxDiffTokens" | "timeout" | "body">;
const skillKeys = ["name", "kind", "output", "organization", "tool", "maxDiffTokens", "timeout"] as const;

export class SkillValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) { super(errors.join("\n")); this.name = "SkillValidationError"; this.errors = errors; }
}

function yamlScalar(text: string): unknown {
  if (text.startsWith('"')) {
    const match = text.match(/^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/);
    if (!match) throw new Error("Invalid quoted YAML value");
    return JSON.parse(match[1]);
  }
  if (text.startsWith("'")) {
    const match = text.match(/^'((?:[^']|'')*)'(?:\s+#.*)?$/);
    if (!match) throw new Error("Invalid quoted YAML value");
    return match[1].replace(/''/g, "'");
  }
  const value = text.replace(/\s+#.*$/, "").trim();
  if (!value || /^[\[\]{}&*!|>]/.test(value) || /:\s/.test(value)) throw new Error("Expected a scalar YAML value");
  return /^[-+]?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
}

export function parseStorySkill(markdown: string): StorySkill {
  const match = markdown.replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new SkillValidationError(["Start the skill with YAML frontmatter between --- lines."]);
  const fields: Record<string, unknown> = {};
  const errors: string[] = [];
  match[1].split(/\r?\n/).forEach((line, index) => {
    if (!line.trim() || line.trimStart().startsWith("#")) return;
    const field = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*?)\s*$/);
    if (!field) { errors.push(`Frontmatter line ${index + 2}: expected field: value.`); return; }
    const [, key, value] = field;
    if (!skillKeys.includes(key as typeof skillKeys[number])) errors.push(`Unknown skill field: ${key}.`);
    else if (Object.hasOwn(fields, key)) errors.push(`Duplicate skill field: ${key}.`);
    else try { fields[key] = yamlScalar(value); } catch (error) { errors.push(`${key}: ${error instanceof Error ? error.message : String(error)}.`); }
  });
  if (typeof fields.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name)) errors.push("name: use lowercase words separated by hyphens.");
  const choice = (key: string, choices: string[]) => { if (!choices.includes(String(fields[key]))) errors.push(`${key}: expected ${choices.join(" | ")}.`); };
  choice("kind", ["story", "workflow"]); choice("output", ["story", "check", "comments", "patch"]);
  fields.organization ??= "auto";
  choice("organization", ["auto", "concepts", "commits"]); choice("tool", ["auto", "codex", "claude"]);
  if ((fields.kind === "story" && fields.output !== "story") || (fields.kind === "workflow" && fields.output === "story")) errors.push("kind and output: stories output story; workflows output check, comments or patch.");
  fields.timeout ??= 300;
  for (const key of ["maxDiffTokens", "timeout"]) if (!Number.isSafeInteger(fields[key]) || Number(fields[key]) <= 0) errors.push(`${key}: expected a positive integer${key === "timeout" ? " in seconds" : ""}.`);
  if (Number(fields.timeout) > 2147483) errors.push("timeout: exceeds the supported timer duration.");
  if (!match[2].trim()) errors.push("body: write a Markdown prompt after the frontmatter.");
  if (errors.length) throw new SkillValidationError(errors);
  return { ...fields as Omit<StorySkill, "markdown" | "body" | "hash">, markdown, body: match[2], hash: storyHash(markdown) };
}

export function serializeStorySkill(fields: SkillFields) {
  const markdown = `---\n${skillKeys.map(key => `${key}: ${typeof fields[key] === "number" ? fields[key] : JSON.stringify(fields[key])}`).join("\n")}\n---\n${fields.body}`;
  parseStorySkill(markdown);
  return markdown;
}

/**
 * The prompt for one story run: the skill body, then the host's fixed output contract, then the input. Generated,
 * lockfile, vendored and binary files are summarized; large diffs keep only high-signal file text within the budget.
 */
export function assembleStoryPrompt(input: StoryInput, skill: StorySkill, contractPrompt: string) {
  const budget = Math.max(0, Math.floor(skill.maxDiffTokens * 4));
  const summary = input.files.map(({ file, classification, hunks }) => ({ file: file.path, oldPath: file.oldPath, status: file.status,
    additions: file.additions, deletions: file.deletions, binary: file.isBinary, classification,
    hunks: hunks.map(hunk => ({ id: hunk.id, header: hunk.text.split("\n", 1)[0] })) }));
  const eligible = input.files.filter(file => file.classification === "source" && !file.file.isBinary);
  const large = input.diffText.length > budget;
  const selected = large ? [...eligible].sort((a, b) => {
    const score = (path: string) => /(^|\/)(__tests__|tests?|docs?)\//.test(path) || /\.(test|spec)\./.test(path) ? 0 : 1;
    return score(b.file.path) - score(a.file.path) || a.text.length - b.text.length;
  }) : eligible;
  const texts: string[] = [];
  const fullTextFiles: string[] = [];
  let remaining = budget;
  for (const file of selected) if (file.text.length <= remaining) { texts.push(file.text); fullTextFiles.push(file.file.path); remaining -= file.text.length; }
  return { prompt: [skill.body, contractPrompt, `Organization preference: ${skill.organization}`,
    `Hunk index: ${JSON.stringify(storyInputContext(input))}`, `File/hunk summary: ${JSON.stringify(summary)}`,
    large ? "Large diff: full text is supplied only for selected high-signal files. All other hunks remain in coverage." : "Generated, lockfile, vendored and binary files are summarized only; all remain in coverage.",
    `Unified diff text:\n${texts.join("")}`].join("\n\n"), summarized: large || eligible.length !== input.files.length,
    fullTextFiles };
}
