import { validateStory, type ChangeStory, type StoryRef } from "./storyContract";
import { storyRowText, type StoryInput } from "./storyHunks";

const heading = (text: string) => text.replace(/[\r\n]+/g, " ");
function codeBlock(text: string) {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), match => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}diff\n${text.trimEnd()}\n${fence}`;
}

export function storyRefMarkdown(ref: StoryRef, input: StoryInput) {
  const hunk = input.hunks.find(hunk => hunk.id === ref.hunk);
  if (!hunk) return "";
  const rows = ref.side ? hunk.rows.filter(row => {
    const line = ref.side === "old" ? row.oldLineNumber : row.newLineNumber;
    return line >= ref.startLine! && line <= ref.endLine!;
  }) : hunk.rows;
  return `${heading(hunk.file)} · ${hunk.id}${ref.side ? ` (${ref.side} ${ref.startLine}–${ref.endLine})` : ""}\n\n${codeBlock(ref.side ? rows.map(storyRowText).join("\n") : hunk.text)}`;
}

export function storyToMarkdown(story: ChangeStory, input: StoryInput) {
  const validated = validateStory(story, input.hunks);
  const parts = [`# ${heading(story.title)}`, `**State:** ${story.state} · **Risk:** ${story.risk.level} — ${story.risk.reason}`, story.goal];
  for (const section of validated.story.sections) parts.push(`## ${section.lookHere ? "Look here: " : ""}${heading(section.title)}`,
    ...(section.commit ? [`Commit: ${heading(section.commit)}`] : []), section.description, ...section.refs.map(ref => storyRefMarkdown(ref, input)));
  if (story.behaviorChanges.length) parts.push("## Behavior changes", ...story.behaviorChanges.map(change =>
    `- **${heading(change.change)}**\n  - Before: ${change.before}\n  - Now: ${change.now}\n  - When: ${change.when}\n  - Why: ${change.why}`));
  if (story.evidence.length) parts.push("## Evidence", story.evidence.map(item => `- ${item.ran ? "Ran" : "Suggested"}: ${item.text}`).join("\n"));
  if (story.notVerified.length) parts.push("## Not verified", story.notVerified.map(text => `- ${text}`).join("\n"));
  if (story.decisions.length) parts.push("## Decisions", story.decisions.map(text => `- ${text}`).join("\n"));
  parts.push("## Not covered by the story", validated.uncovered.length
    ? validated.uncovered.map(group => `### ${heading(group.file)}\n\n${group.hunkIds.map(hunk => storyRefMarkdown({ hunk }, input)).join("\n\n")}`).join("\n\n")
    : "All hunks are covered.");
  const noHunks = input.files.filter(file => !file.hunks.length);
  if (noHunks.length) parts.push("## Files without text hunks", noHunks.map(({ file }) => `- ${heading(file.path)} (${file.status}${file.isBinary ? ", binary" : ""})`).join("\n"));
  return `${parts.filter(Boolean).join("\n\n")}\n`;
}
