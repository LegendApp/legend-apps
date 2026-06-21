import { warmSyntaxHighlighter, type SyntaxHighlightTiming } from "@legend-desktop/syntax-parser";

type CodeSyntaxWarmupResult = {
  language: string;
  timing: SyntaxHighlightTiming;
};

let warmupPromise: Promise<CodeSyntaxWarmupResult[]> | null = null;

function formatMs(value: number) {
  return `${value.toFixed(1)} ms`;
}

export function warmCodeSyntaxHighlighters(languages = ["tsx"]) {
  warmupPromise ??= languages.reduce<Promise<CodeSyntaxWarmupResult[]>>(
    (promise, language) => promise.then((results) => (
      warmSyntaxHighlighter(language, "github-dark").then((timing) => [...results, { language, timing }])
    )),
    Promise.resolve([]),
  ).then((results) => {
    console.info(
      results
        .map(({ language, timing }) => (
          `[CodeViewer] warm ${language} total=${formatMs(timing.totalMs)} context=${formatMs(timing.contextMs)} tokenize=${formatMs(timing.tokenizeMs)}`
        ))
        .join(" "),
    );
    return results;
  }).catch((error: unknown) => {
    warmupPromise = null;
    throw error;
  });

  return warmupPromise;
}
