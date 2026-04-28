import NativeMarkdownParser from "./NativeMarkdownParser";

export type MarkdownDialect = "commonmark" | "github";

export type MarkdownParserOptions = Readonly<{
  dialect?: MarkdownDialect;
  collapseWhitespace?: boolean;
  hardSoftBreaks?: boolean;
  noHtml?: boolean;
  noIndentedCodeBlocks?: boolean;
  permissiveAutolinks?: boolean;
  tables?: boolean;
  taskLists?: boolean;
  strikethrough?: boolean;
  latexMath?: boolean;
  wikiLinks?: boolean;
  underline?: boolean;
}>;

export type MarkdownTextRun = Readonly<{
  type: "text" | "entity" | "softBreak" | "lineBreak" | "code" | "html" | "latexMath" | "null";
  text: string;
  offset: number;
  length: number;
  marks?: readonly string[];
  href?: string;
  title?: string;
  src?: string;
  target?: string;
}>;

export type MarkdownBlock = Readonly<{
  id: string;
  type: string;
  index: number;
  parentIndex?: number;
  depth: number;
  markdown?: string;
  text: string;
  runs: readonly MarkdownTextRun[];
  attrs?: Record<string, string | number | boolean | null>;
}>;

export type MarkdownParseResult = Readonly<{
  blocks: readonly MarkdownBlock[];
  error?: string;
  warnings?: readonly string[];
}>;

function parseJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

export function parseMarkdown(markdown: string, options: MarkdownParserOptions = {}) {
  return NativeMarkdownParser.parseMarkdown(markdown, JSON.stringify(options)).then((json) =>
    parseJson<MarkdownParseResult>(json, { blocks: [] }),
  );
}

export function parseMarkdownFile(filePath: string, options: MarkdownParserOptions = {}) {
  return NativeMarkdownParser.parseMarkdownFile(filePath, JSON.stringify(options)).then((json) =>
    parseJson<MarkdownParseResult>(json, { blocks: [] }),
  );
}

export { NativeMarkdownParser };
