import { parse as parseYaml } from "yaml";

type SourceLine = {
  content: string;
  end: number;
  start: number;
};

type CommentRange = {
  contentEnd: number;
  contentStart: number;
  end: number;
  start: number;
};

type SlideRange = {
  end: number;
  start: number;
};

export type SpeakerNotesFileAccess = {
  read(path: string): Promise<string>;
  writeIfUnchanged(path: string, expectedContents: string, contents: string): Promise<boolean>;
};

function splitSourceLines(source: string) {
  const lines: SourceLine[] = [];
  const pattern = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) && match[0].length > 0) {
    const start = match.index;
    const end = start + match[0].length;
    lines.push({ content: match[0].replace(/(?:\r\n|\r|\n)$/, ""), end, start });
  }
  return lines;
}

function fencedLines(lines: readonly SourceLine[]) {
  const result = new Set<number>();
  let fence: "`" | "~" | undefined;
  lines.forEach((line, index) => {
    const match = /^\s*(`{3,}|~{3,})/.exec(line.content);
    if (match) {
      const marker = match[1][0] as "`" | "~";
      result.add(index);
      fence = fence === marker ? undefined : fence ?? marker;
    } else if (fence) {
      result.add(index);
    }
  });
  return result;
}

function commentRanges(source: string, lines: readonly SourceLine[], fenced: ReadonlySet<number>) {
  const ranges: CommentRange[] = [];
  let segmentStart: number | undefined;

  const scanSegment = (start: number, end: number) => {
    const segment = source.slice(start, end);
    const pattern = /<!--([\s\S]*?)-->/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(segment))) {
      const commentStart = start + match.index;
      ranges.push({
        contentEnd: commentStart + match[0].length - 3,
        contentStart: commentStart + 4,
        end: commentStart + match[0].length,
        start: commentStart,
      });
    }
  };

  lines.forEach((line, index) => {
    if (!fenced.has(index)) {
      segmentStart ??= line.start;
      return;
    }
    if (segmentStart !== undefined) {
      scanSegment(segmentStart, line.start);
      segmentStart = undefined;
    }
  });
  if (segmentStart !== undefined) {
    scanSegment(segmentStart, source.length);
  }
  return ranges;
}

function jsxDepths(
  source: string,
  lines: readonly SourceLine[],
  fenced: ReadonlySet<number>,
  comments: readonly CommentRange[],
) {
  const masked = source.split("");
  const mask = (start: number, end: number) => {
    for (let index = start; index < end; index += 1) {
      if (masked[index] !== "\n" && masked[index] !== "\r") {
        masked[index] = " ";
      }
    }
  };
  lines.forEach((line, index) => {
    if (fenced.has(index)) {
      mask(line.start, line.end);
    }
  });
  comments.forEach((comment) => mask(comment.start, comment.end));

  const tags: Array<{ closing: boolean; end: number; selfClosing: boolean; start: number }> = [];
  const tagPattern = /<(\/)?(?:[A-Za-z][\w.:-]*|)(?:\s[^<>]*?)?(\/)?\s*>/g;
  let match: RegExpExecArray | null;
  const content = masked.join("");
  while ((match = tagPattern.exec(content))) {
    tags.push({
      closing: Boolean(match[1]),
      end: match.index + match[0].length,
      selfClosing: Boolean(match[2]),
      start: match.index,
    });
  }

  const events = tags.flatMap((tag) => tag.selfClosing
    ? []
    : [{ delta: tag.closing ? -1 : 1, position: tag.closing ? tag.start : tag.end }]
  ).sort((left, right) => left.position - right.position);
  const depths: number[] = [];
  let depth = 0;
  let eventIndex = 0;
  lines.forEach((line) => {
    while (eventIndex < events.length && events[eventIndex].position <= line.start) {
      depth = Math.max(0, depth + events[eventIndex].delta);
      eventIndex += 1;
    }
    const insideTag = tags.some((tag) => tag.start < line.end && tag.end > line.start);
    depths.push(insideTag ? Math.max(1, depth) : depth);
  });
  return depths;
}

function expressionDepths(lines: readonly SourceLine[], fenced: ReadonlySet<number>) {
  const depths: number[] = [];
  let blockComment = false;
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;

  lines.forEach((line, lineIndex) => {
    depths.push(depth);
    if (fenced.has(lineIndex)) {
      return;
    }

    for (let index = 0; index < line.content.length; index += 1) {
      const character = line.content[index];
      const next = line.content[index + 1];
      if (blockComment) {
        if (character === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (character === "\\") {
          index += 1;
        } else if (character === quote) {
          quote = undefined;
        }
        continue;
      }
      if (depth > 0 && character === "/" && next === "/") {
        break;
      }
      if (depth > 0 && character === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }
      if (depth > 0 && (character === "'" || character === '"' || character === "`")) {
        quote = character;
        continue;
      }
      if (character === "{" && line.content[index - 1] !== "\\") {
        depth += 1;
      } else if (character === "}" && depth > 0 && line.content[index - 1] !== "\\") {
        depth -= 1;
      }
    }
  });

  return depths;
}

function isYamlObject(source: string) {
  try {
    const parsed = parseYaml(source);
    return Boolean(parsed) && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function sourceStructure(source: string) {
  const lines = splitSourceLines(source);
  const fenced = fencedLines(lines);
  const comments = commentRanges(source, lines, fenced);
  const depths = jsxDepths(source, lines, fenced, comments);
  const expressions = expressionDepths(lines, fenced);
  const delimiters = lines
    .map((line, index) => ({ index, line }))
    .filter(({ index, line }) =>
      !fenced.has(index) && depths[index] === 0 && expressions[index] === 0
      && /^[ \t]{0,3}---[ \t]*$/.test(line.content)
      && !comments.some((comment) => comment.start <= line.start && comment.end >= line.end));
  const firstContentLine = lines.findIndex((line) => line.content.trim().length > 0);
  const documentFrontmatter = delimiters[0]?.index === firstContentLine && delimiters.length > 1
    ? [delimiters[0], delimiters[1]] as const
    : undefined;
  const slideFrontmatter: Array<readonly [typeof delimiters[number], typeof delimiters[number]]> = [];
  const frontmatterDelimiterLines = new Set<number>();
  if (documentFrontmatter) {
    frontmatterDelimiterLines.add(documentFrontmatter[0].index);
    frontmatterDelimiterLines.add(documentFrontmatter[1].index);
  }

  for (let index = documentFrontmatter ? 2 : 0; index < delimiters.length - 1; index += 1) {
    const start = delimiters[index];
    const end = delimiters[index + 1];
    if (isYamlObject(source.slice(start.line.end, end.line.start))) {
      slideFrontmatter.push([start, end]);
      frontmatterDelimiterLines.add(start.index);
      frontmatterDelimiterLines.add(end.index);
      index += 1;
    }
  }

  const events = [
    ...delimiters
      .filter(({ index }) => !frontmatterDelimiterLines.has(index))
      .map(({ line }) => ({ end: line.end, kind: "separator" as const, start: line.start })),
    ...slideFrontmatter.map(([start, end]) => ({ end: end.line.end, kind: "frontmatter" as const, start: start.line.start })),
  ].sort((left, right) => left.start - right.start);

  const slides: SlideRange[] = [];
  let slideStart = documentFrontmatter?.[1].line.end ?? 0;
  for (const event of events) {
    if (event.kind === "separator") {
      slides.push({ end: event.start, start: slideStart });
      slideStart = event.end;
    } else {
      const preceding = source.slice(slideStart, event.start).trim();
      if (preceding.length > 0) {
        slides.push({ end: event.start, start: slideStart });
      }
      slideStart = event.end;
    }
  }
  if (source.slice(slideStart).trim().length > 0 || slides.length === 0) {
    slides.push({ end: source.length, start: slideStart });
  }

  return { comments, slides, frontmatter: [
    ...(documentFrontmatter ? [documentFrontmatter] : []), ...slideFrontmatter,
  ].map(([start, end]) => ({ start: start.line.end, end: end.line.start })) };
}

/** UTF-16 ranges match NSTextView selection offsets, including emoji. */
export function getDeckSourceStructure(source: string) {
  const { slides, frontmatter } = sourceStructure(source);
  return { frontmatter, slides: slides.map((slide, index) => ({
    start: index === 0 ? 0 : slides[index - 1].end,
    contentStart: slide.start,
    end: index === slides.length - 1 ? source.length : slide.end,
  })) };
}

export function slideAtSourceOffset(source: string, offset: number) {
  const slides = getDeckSourceStructure(source).slides;
  const index = slides.findIndex((slide) => offset < slide.end);
  return index < 0 ? Math.max(0, slides.length - 1) : index;
}

function lineEndingForSource(source: string) {
  return source.includes("\r\n") ? "\r\n" : source.includes("\r") ? "\r" : "\n";
}

function noteComment(notes: string) {
  return notes.includes("\n") || notes.includes("\r")
    ? `<!--\n${notes}\n-->`
    : `<!-- ${notes} -->`;
}

function slideSource(source: string, slideIndex: number) {
  const slide = sourceStructure(source).slides[slideIndex];
  if (!slide) {
    throw new Error(`Slide ${slideIndex + 1} does not exist in the MDX source.`);
  }
  return source.slice(slide.start, slide.end);
}

export function updateSlideSpeakerNotes(source: string, slideIndex: number, nextNotes: string) {
  if (!Number.isInteger(slideIndex) || slideIndex < 0) {
    throw new Error("Slide index must be a non-negative integer.");
  }
  if (nextNotes.includes("-->")) {
    throw new Error('Speaker notes cannot contain the HTML comment terminator "-->".');
  }

  const { comments, slides } = sourceStructure(source);
  const slide = slides[slideIndex];
  if (!slide) {
    throw new Error(`Slide ${slideIndex + 1} does not exist in the MDX source.`);
  }
  const notes = nextNotes.trim();
  const slideComments = comments.filter((comment) => comment.start >= slide.start && comment.end <= slide.end);
  const existingNotes = slideComments
    .map((comment) => source.slice(comment.contentStart, comment.contentEnd).trim())
    .join("\n\n");
  if (existingNotes === notes) {
    return source;
  }

  if (slideComments.length > 0) {
    let output = source.slice(0, slideComments[0].start);
    if (notes.length > 0) {
      output += noteComment(notes);
    }
    let cursor = slideComments[0].end;
    for (const comment of slideComments.slice(1)) {
      output += source.slice(cursor, comment.start);
      cursor = comment.end;
    }
    return output + source.slice(cursor);
  }

  if (notes.length === 0) {
    return source;
  }

  const ending = lineEndingForSource(source);
  const before = source.slice(0, slide.end);
  const after = source.slice(slide.end);
  const leading = before.endsWith(`${ending}${ending}`) ? "" : before.endsWith(ending) ? ending : `${ending}${ending}`;
  const trailing = after.length > 0 ? `${ending}${ending}` : source.endsWith(ending) ? ending : "";
  return `${before}${leading}${noteComment(notes)}${trailing}${after}`;
}

export async function persistSlideSpeakerNotesWithFileAccess(
  path: string,
  slideIndex: number,
  notes: string,
  fileAccess: SpeakerNotesFileAccess,
) {
  let expectedSlideSource: string | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const source = await fileAccess.read(path);
    const currentSlideSource = slideSource(source, slideIndex);
    if (expectedSlideSource === undefined) {
      expectedSlideSource = currentSlideSource;
    } else if (currentSlideSource !== expectedSlideSource) {
      throw new Error("The target slide changed while speaker notes were being saved. Please review it and try again.");
    }
    const updatedSource = updateSlideSpeakerNotes(source, slideIndex, notes);
    if (updatedSource === source) {
      return false;
    }
    if (await fileAccess.writeIfUnchanged(path, source, updatedSource)) {
      return true;
    }
  }
  throw new Error("The deck changed while speaker notes were being saved. Please try again.");
}
