import {
  highlightString,
  loadCodeFile,
  type SyntaxHighlightTiming,
} from "@legend-desktop/syntax-parser";
import { codeInitialLineCount } from "./appConstants";
import { getCodeLanguage } from "./codeFiles";
import { getCodeSyntaxThemeSetting } from "./codeSettings";
import { warmCodeSyntaxHighlighters } from "./codeSyntaxWarmup";

export type CodeLoadBenchmarkResult = {
  filePath: string;
  initialLineCount: number;
  initialRows: number;
  jsMs: number;
  styles: number;
  timing: SyntaxHighlightTiming;
};

export type CodeStringBenchmarkResult = {
  jsMs: number;
  sourceLength: number;
  styles: number;
  timing: SyntaxHighlightTiming;
};

declare global {
  var __legendCodeBenchmarkLoadFile: ((filePath: string, initialLineCount?: number) => Promise<CodeLoadBenchmarkResult>) | undefined;
  var __legendCodeBenchmarkHighlightString: ((source: string, language?: string) => Promise<CodeStringBenchmarkResult>) | undefined;
  var __legendCodeBenchmarkWarmHighlighters: typeof warmCodeSyntaxHighlighters | undefined;
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

async function benchmarkLoadFile(filePath: string, initialLineCount = codeInitialLineCount) {
  const startedAt = nowMs();
  const result = await loadCodeFile(filePath, getCodeLanguage(filePath), getCodeSyntaxThemeSetting(), initialLineCount);
  const finishedAt = nowMs();

  return {
    filePath,
    initialLineCount,
    initialRows: result.initialLines.length,
    jsMs: finishedAt - startedAt,
    styles: result.styles.length,
    timing: result.timing,
  };
}

async function benchmarkHighlightString(source: string, language = "tsx") {
  const startedAt = nowMs();
  const result = await highlightString(source, language, getCodeSyntaxThemeSetting());
  const finishedAt = nowMs();

  return {
    jsMs: finishedAt - startedAt,
    sourceLength: source.length,
    styles: result.styles.length,
    timing: result.timing,
  };
}

export function installCodeBenchmarkHook() {
  if (__DEV__) {
    globalThis.__legendCodeBenchmarkHighlightString = benchmarkHighlightString;
    globalThis.__legendCodeBenchmarkLoadFile = benchmarkLoadFile;
    globalThis.__legendCodeBenchmarkWarmHighlighters = warmCodeSyntaxHighlighters;
  }
}
