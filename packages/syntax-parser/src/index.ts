import { NitroModules } from "react-native-nitro-modules";
import type { SyntaxParser } from "./SyntaxParser.nitro";

let syntaxParser: SyntaxParser | undefined;

function getSyntaxParser() {
  syntaxParser ??= NitroModules.createHybridObject<SyntaxParser>("SyntaxParser");
  return syntaxParser;
}

export function highlightString(source: string, language = "typescript", theme = "github-dark") {
  return getSyntaxParser().highlightString(source, language, theme);
}

export type {
  SyntaxHighlightResult,
  SyntaxHighlightTiming,
  SyntaxRenderLine,
  SyntaxStyle,
  SyntaxTokenRun,
} from "./SyntaxParser.nitro";
