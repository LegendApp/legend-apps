import { NitroModules } from "react-native-nitro-modules";
import type { MarkdownParser } from "./MarkdownParser.nitro";

export type MarkdownFileLoadOptions = Readonly<{
  initialBlockCount?: number;
}>;

const DEFAULT_INITIAL_BLOCK_COUNT = 64;

let markdownParser: MarkdownParser | undefined;

function getMarkdownParser() {
  markdownParser ??= NitroModules.createHybridObject<MarkdownParser>("MarkdownParser");
  return markdownParser;
}

export function loadMarkdownFile(filePath: string, options: MarkdownFileLoadOptions = {}) {
  return getMarkdownParser().loadMarkdownFile(filePath, options.initialBlockCount ?? DEFAULT_INITIAL_BLOCK_COUNT);
}

export type {
  MarkdownDocument,
  MarkdownDocumentTiming,
  MarkdownFileLoadResult,
  MarkdownRenderBlock,
} from "./MarkdownParser.nitro";
