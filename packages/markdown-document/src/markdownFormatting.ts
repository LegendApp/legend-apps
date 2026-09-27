export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type LinePrefixKind = "heading" | "blockquote" | "orderedList" | "taskList" | "unorderedList";

function fencedCodeBlockContent(markdown: string): string | undefined {
  const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r?\n|$)/.exec(markdown);
  if (!opening || (opening[1][0] === "`" && opening[2].includes("`"))) {
    return undefined;
  }
  const content = markdown.slice(opening[0].length);
  for (const closing of content.matchAll(/^ {0,3}(`+|~+)[ \t]*\r?$/gm)) {
    if (closing[1][0] === opening[1][0] && closing[1].length >= opening[1].length) {
      if (content.slice(closing.index + closing[0].length).trim()) {
        return undefined;
      }
      return content.slice(0, closing.index).replace(/\r?\n$/, "");
    }
  }
  return content;
}
const headingPrefixPattern = /^\s{0,3}#{1,6}\s+/;
const blockquotePrefixPattern = /^\s{0,3}>\s?/;
const unorderedListPrefixPattern = /^\s*[-*+]\s+/;
const orderedListPrefixPattern = /^\s*\d+[.)]\s+/;
const taskListPrefixPattern = /^\s*[-*+]\s+\[[ xX]\]\s+/;
const blockquoteContinuationPattern = /^(\s{0,3}>\s?)(.*)$/;
const unorderedListContinuationPattern = /^(\s*)([-*+])(?:\s+(.*)|\s*)$/;
const orderedListContinuationPattern = /^(\s*)(\d+)([.)])(?:\s+(.*)|\s*)$/;
const taskListContinuationPattern = /^(\s*)([-*+])\s+\[[ xX]\](?:\s+(.*)|\s*)$/;

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
  return fencedCodeBlockContent(markdown) ?? markdown;
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

function continueLine(prefix: string, content: string, afterMarkdown: string) {
  if (content.trim().length === 0 && afterMarkdown.length === 0) {
    return {
      afterMarkdown: "",
      beforeMarkdown: "",
    };
  }
  return {
    afterMarkdown: afterMarkdown.length > 0 ? `${prefix}${afterMarkdown}` : prefix,
    beforeMarkdown: undefined,
  };
}

export function getSplitContinuationMarkdown(beforeMarkdown: string, afterMarkdown: string) {
  const taskListMatch = taskListContinuationPattern.exec(beforeMarkdown);
  if (taskListMatch) {
    return continueLine(`${taskListMatch[1] ?? ""}${taskListMatch[2] ?? "-"} [ ] `, taskListMatch[3] ?? "", afterMarkdown);
  }

  const orderedListMatch = orderedListContinuationPattern.exec(beforeMarkdown);
  if (orderedListMatch) {
    return continueLine(
      `${orderedListMatch[1] ?? ""}${Number(orderedListMatch[2] ?? 0) + 1}${orderedListMatch[3] ?? "."} `,
      orderedListMatch[4] ?? "",
      afterMarkdown,
    );
  }

  const unorderedListMatch = unorderedListContinuationPattern.exec(beforeMarkdown);
  if (unorderedListMatch) {
    return continueLine(`${unorderedListMatch[1] ?? ""}${unorderedListMatch[2] ?? "-"} `, unorderedListMatch[3] ?? "", afterMarkdown);
  }

  const blockquoteMatch = blockquoteContinuationPattern.exec(beforeMarkdown);
  if (blockquoteMatch) {
    return continueLine(blockquoteMatch[1] ?? "> ", blockquoteMatch[2] ?? "", afterMarkdown);
  }

  return {
    afterMarkdown,
    beforeMarkdown: undefined,
  };
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
  const content = fencedCodeBlockContent(markdown);
  if (content !== undefined) {
    return content;
  }
  const longestRun = [...markdown.matchAll(/`+/g)].reduce((length, run) => Math.max(length, run[0].length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${markdown}\n${fence}`;
}

export function thematicBreakMarkdown() {
  return "---";
}

function inlineMarkdownLines(markdown: string) {
  let fence: { marker: string; length: number } | undefined;
  return markdown.split(/(\r?\n)/).map((line) => {
    const match = /^(\s*(?:>\s*)*(?:(?:#{1,6}|[-+*]|\d+[.)])\s+)?(?:\[[ xX]\]\s+)?)(.*?)(\s*)$/.exec(line);
    const marker = /^(`{3,}|~{3,})/.exec(match?.[2] ?? "")?.[1];
    if (fence) {
      if (marker?.[0] === fence.marker && marker.length >= fence.length && match?.[2] === marker) fence = undefined;
      return { line };
    }
    if (marker) {
      fence = { marker: marker[0]!, length: marker.length };
      return { line };
    }
    // Keep block syntax and surrounding whitespace outside inline delimiters.
    if (!match?.[2] || /^(?:[-*_]\s*){3,}$/.test(line.trim()) || /^ {4}|^\t/.test(line)
      || /^\s*\|(?!\|).*\|\s*$/.test(line) || /^ {0,3}(?:=+|-+)\s*$/.test(line)) return { line };
    const [, prefix] = match;
    let content = match[2]!, suffix = match[3]!;
    const closingHeading = /#{1,6}\s+$/.test(prefix!) ? /\s+#+$/.exec(content)?.[0] : undefined;
    if (closingHeading) {
      content = content.slice(0, -closingHeading.length);
      suffix = closingHeading + suffix;
    }
    return { line, prefix, content, suffix };
  });
}

/** Apply inline styles separately on each line so delimiters never cross block boundaries. */
export function toggleInlineMarkdown(markdown: string, delimiter: "**" | "*" | "_" | "~~" | "||") {
  const lines = inlineMarkdownLines(markdown).map((line) => {
    const content = line.content;
    const wrapped = content !== undefined && content.startsWith(delimiter) && content.endsWith(delimiter)
      && content.length > delimiter.length * 2
      && (delimiter !== "*" || !content.startsWith("**") || content.startsWith("***"));
    return { ...line, wrapped };
  });
  const eligible = lines.filter((line) => line.content !== undefined);
  const remove = eligible.length > 0 && eligible.every((line) => line.wrapped);
  return lines.map(({ line, prefix, content, suffix, wrapped }) => content === undefined ? line
    : prefix + (remove ? content.slice(delimiter.length, -delimiter.length)
      : wrapped ? content : delimiter + content + delimiter) + suffix).join("");
}

function codeSpanEnd(markdown: string, start: number) {
  const delimiter = /^`+/.exec(markdown.slice(start))?.[0];
  if (!delimiter) return start;
  let end = markdown.indexOf(delimiter, start + delimiter.length);
  while (end >= 0) {
    if (markdown[end - 1] !== "`" && markdown[end + delimiter.length] !== "`") return end + delimiter.length;
    end = markdown.indexOf(delimiter, end + delimiter.length);
  }
  return start;
}

function linkPartEnd(markdown: string, start: number, opening: string, closing: string) {
  let depth = 1;
  for (let index = start + 1; index < markdown.length; index++) {
    const character = markdown[index];
    if (character === "\\") { index++; continue; }
    if (opening === "[" && character === "`") {
      const end = codeSpanEnd(markdown, index);
      if (end > index) { index = end - 1; continue; }
    }
    if (opening === "(" && (character === "<" || ((character === '"' || character === "'") && /\s/.test(markdown[index - 1]!)))) {
      const endQuote = character === "<" ? ">" : character;
      for (index++; index < markdown.length && markdown[index] !== endQuote; index++) {
        if (markdown[index] === "\\") index++;
      }
      continue;
    }
    if (character === opening) depth++;
    if (character === closing && --depth === 0) return index;
  }
  return -1;
}

/** A new link must contain the old labels, never nested link destinations. */
function withoutInlineLinks(markdown: string): string {
  let result = "";
  for (let index = 0; index < markdown.length;) {
    if (markdown[index] === "\\") { result += markdown.slice(index, index + 2); index += 2; continue; }
    const codeEnd = markdown[index] === "`" ? codeSpanEnd(markdown, index) : index;
    if (codeEnd > index) { result += markdown.slice(index, codeEnd); index = codeEnd; continue; }
    const autolink = markdown[index] === "<"
      ? /^<([a-z][a-z\d+.-]*:[^<>\s]*|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>/i.exec(markdown.slice(index)) : null;
    if (autolink) { result += autolink[1]; index += autolink[0].length; continue; }
    const image = markdown[index] === "!" && markdown[index + 1] === "[";
    const labelStart = index + (image ? 1 : 0);
    if (markdown[labelStart] === "[") {
      const labelEnd = linkPartEnd(markdown, labelStart, "[", "]");
      const destinationEnd = labelEnd >= 0 && markdown[labelEnd + 1] === "("
        ? linkPartEnd(markdown, labelEnd + 1, "(", ")") : -1;
      if (destinationEnd >= 0) {
        result += image ? markdown.slice(index, destinationEnd + 1)
          : withoutInlineLinks(markdown.slice(labelStart + 1, labelEnd));
        index = destinationEnd + 1;
        continue;
      }
    }
    result += markdown[index++];
  }
  return result;
}

export function linkSelectedMarkdown(markdown: string, url: string) {
  const destination = url.replace(/[\\()]/g, "\\$&").replace(/\s/g, (space) => encodeURIComponent(space));
  return inlineMarkdownLines(markdown).map(({ line, prefix, content, suffix }) => content === undefined
    ? line : `${prefix}[${withoutInlineLinks(content)}](${destination})${suffix}`).join("");
}
