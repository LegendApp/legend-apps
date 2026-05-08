export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type LinePrefixKind = "heading" | "blockquote" | "orderedList" | "taskList" | "unorderedList";

const fencedCodeBlockPattern = /^\s*```[^\n]*\n?([\s\S]*?)\n?```\s*$/;
const headingPrefixPattern = /^\s{0,3}#{1,6}\s+/;
const blockquotePrefixPattern = /^\s{0,3}>\s?/;
const unorderedListPrefixPattern = /^\s*[-*+]\s+/;
const orderedListPrefixPattern = /^\s*\d+[.)]\s+/;
const taskListPrefixPattern = /^\s*[-*+]\s+\[[ xX]\]\s+/;

function splitLines(markdown: string) {
  return markdown.split(/\r?\n/);
}

function nonEmptyLines(markdown: string) {
  return splitLines(markdown).filter((line) => line.trim().length > 0);
}

function stripLinePrefix(line: string, kinds: LinePrefixKind[] = [
  "heading",
  "blockquote",
  "taskList",
  "orderedList",
  "unorderedList",
]) {
  let nextLine = line;
  for (const kind of kinds) {
    if (kind === "heading") {
      nextLine = nextLine.replace(headingPrefixPattern, "");
    } else if (kind === "blockquote") {
      nextLine = nextLine.replace(blockquotePrefixPattern, "");
    } else if (kind === "taskList") {
      nextLine = nextLine.replace(taskListPrefixPattern, "");
    } else if (kind === "orderedList") {
      nextLine = nextLine.replace(orderedListPrefixPattern, "");
    } else {
      nextLine = nextLine.replace(unorderedListPrefixPattern, "");
    }
  }
  return nextLine;
}

function unwrapCodeBlock(markdown: string) {
  const match = fencedCodeBlockPattern.exec(markdown);
  return match ? match[1] ?? "" : markdown;
}

function mapNonEmptyLines(markdown: string, transform: (line: string, nonEmptyIndex: number) => string) {
  let nonEmptyIndex = 0;
  return splitLines(unwrapCodeBlock(markdown)).map((line) => {
    if (line.trim().length === 0) {
      return line;
    }
    const nextLine = transform(line, nonEmptyIndex);
    nonEmptyIndex += 1;
    return nextLine;
  }).join("\n");
}

function everyNonEmptyLine(markdown: string, predicate: (line: string) => boolean) {
  const lines = nonEmptyLines(unwrapCodeBlock(markdown));
  return lines.length > 0 && lines.every(predicate);
}

export function setParagraphMarkdown(markdown: string) {
  return mapNonEmptyLines(markdown, (line) => stripLinePrefix(line));
}

export function setHeadingMarkdown(markdown: string, level: HeadingLevel) {
  const prefix = `${"#".repeat(level)} `;
  return mapNonEmptyLines(markdown, (line) => `${prefix}${stripLinePrefix(line)}`);
}

export function toggleBlockquoteMarkdown(markdown: string) {
  const isBlockquote = everyNonEmptyLine(markdown, (line) => blockquotePrefixPattern.test(line));
  return mapNonEmptyLines(markdown, (line) => {
    if (isBlockquote) {
      return line.replace(blockquotePrefixPattern, "");
    }
    return `> ${line}`;
  });
}

export function toggleUnorderedListMarkdown(markdown: string) {
  const isUnorderedList = everyNonEmptyLine(markdown, (line) => unorderedListPrefixPattern.test(line));
  return mapNonEmptyLines(markdown, (line) => {
    if (isUnorderedList) {
      return line.replace(unorderedListPrefixPattern, "");
    }
    return `- ${stripLinePrefix(line, ["taskList", "orderedList", "unorderedList"])}`;
  });
}

export function toggleOrderedListMarkdown(markdown: string) {
  const isOrderedList = everyNonEmptyLine(markdown, (line) => orderedListPrefixPattern.test(line));
  return mapNonEmptyLines(markdown, (line, index) => {
    if (isOrderedList) {
      return line.replace(orderedListPrefixPattern, "");
    }
    return `${index + 1}. ${stripLinePrefix(line, ["taskList", "orderedList", "unorderedList"])}`;
  });
}

export function toggleTaskListMarkdown(markdown: string) {
  const isTaskList = everyNonEmptyLine(markdown, (line) => taskListPrefixPattern.test(line));
  return mapNonEmptyLines(markdown, (line) => {
    if (isTaskList) {
      return line.replace(taskListPrefixPattern, "");
    }
    return `- [ ] ${stripLinePrefix(line, ["taskList", "orderedList", "unorderedList"])}`;
  });
}

export function toggleCodeBlockMarkdown(markdown: string) {
  const match = fencedCodeBlockPattern.exec(markdown);
  if (match) {
    return match[1] ?? "";
  }
  return `\`\`\`\n${markdown}\n\`\`\``;
}

export function thematicBreakMarkdown() {
  return "---";
}
