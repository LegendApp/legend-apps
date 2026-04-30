import NativeMarkdownParser from "./NativeMarkdownParser";
import { NitroModules } from "react-native-nitro-modules";
import type { MarkdownDocument, MarkdownParser } from "./MarkdownParser.nitro";

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

const MD_FLAG_COLLAPSEWHITESPACE = 0x0001;
const MD_FLAG_PERMISSIVEURLAUTOLINKS = 0x0004;
const MD_FLAG_PERMISSIVEEMAILAUTOLINKS = 0x0008;
const MD_FLAG_NOINDENTEDCODEBLOCKS = 0x0010;
const MD_FLAG_NOHTMLBLOCKS = 0x0020;
const MD_FLAG_NOHTMLSPANS = 0x0040;
const MD_FLAG_TABLES = 0x0100;
const MD_FLAG_STRIKETHROUGH = 0x0200;
const MD_FLAG_PERMISSIVEWWWAUTOLINKS = 0x0400;
const MD_FLAG_TASKLISTS = 0x0800;
const MD_FLAG_LATEXMATHSPANS = 0x1000;
const MD_FLAG_WIKILINKS = 0x2000;
const MD_FLAG_UNDERLINE = 0x4000;
const MD_FLAG_HARD_SOFT_BREAKS = 0x8000;
const MD_FLAG_PERMISSIVEAUTOLINKS =
  MD_FLAG_PERMISSIVEEMAILAUTOLINKS | MD_FLAG_PERMISSIVEURLAUTOLINKS | MD_FLAG_PERMISSIVEWWWAUTOLINKS;
const MD_FLAG_NOHTML = MD_FLAG_NOHTMLBLOCKS | MD_FLAG_NOHTMLSPANS;
const MD_DIALECT_GITHUB =
  MD_FLAG_PERMISSIVEAUTOLINKS | MD_FLAG_TABLES | MD_FLAG_STRIKETHROUGH | MD_FLAG_TASKLISTS;

function markdownParserFlags(options: MarkdownParserOptions) {
  let flags = options.dialect === "commonmark" ? 0 : MD_DIALECT_GITHUB;

  if (options.collapseWhitespace) {
    flags |= MD_FLAG_COLLAPSEWHITESPACE;
  }
  if (options.hardSoftBreaks) {
    flags |= MD_FLAG_HARD_SOFT_BREAKS;
  }
  if (options.noHtml) {
    flags |= MD_FLAG_NOHTML;
  }
  if (options.noIndentedCodeBlocks) {
    flags |= MD_FLAG_NOINDENTEDCODEBLOCKS;
  }
  if (options.permissiveAutolinks) {
    flags |= MD_FLAG_PERMISSIVEAUTOLINKS;
  }
  if (options.tables) {
    flags |= MD_FLAG_TABLES;
  }
  if (options.taskLists) {
    flags |= MD_FLAG_TASKLISTS;
  }
  if (options.strikethrough) {
    flags |= MD_FLAG_STRIKETHROUGH;
  }
  if (options.latexMath) {
    flags |= MD_FLAG_LATEXMATHSPANS;
  }
  if (options.wikiLinks) {
    flags |= MD_FLAG_WIKILINKS;
  }
  if (options.underline) {
    flags |= MD_FLAG_UNDERLINE;
  }

  return flags;
}

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

let nitroMarkdownParser: MarkdownParser | undefined;

export function getMarkdownParserDocumentApi() {
  nitroMarkdownParser ??= NitroModules.createHybridObject<MarkdownParser>("MarkdownParser");
  return nitroMarkdownParser;
}

export function parseMarkdownDocument(markdown: string, options: MarkdownParserOptions = {}): MarkdownDocument {
  return getMarkdownParserDocumentApi().scanMarkdown(markdown);
}

export function parseMarkdownFileDocument(filePath: string, options: MarkdownParserOptions = {}) {
  return getMarkdownParserDocumentApi().scanMarkdownFile(filePath);
}

export function parseMarkdownDocumentWithMd4c(markdown: string, options: MarkdownParserOptions = {}): MarkdownDocument {
  return getMarkdownParserDocumentApi().parseMarkdown(markdown, markdownParserFlags(options));
}

export function parseMarkdownFileDocumentWithMd4c(filePath: string, options: MarkdownParserOptions = {}) {
  return getMarkdownParserDocumentApi().parseMarkdownFile(filePath, markdownParserFlags(options));
}

export { NativeMarkdownParser };
export type { MarkdownBlockSnapshot, MarkdownDocument, MarkdownDocumentTiming, MarkdownParser } from "./MarkdownParser.nitro";
