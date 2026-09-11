import type { DiffDocument } from "@legend-apps/diff-parser";
import { isKnownGrammar, treeGrammarManager } from "@legend-apps/syntax-parser";

type GrammarDocument = Pick<DiffDocument, "getMissingSyntaxLanguages" | "refreshSyntaxGrammars">;

// Demand comes from native queries, not a scan of the entire diff. A failed
// request waits for explicit Retry; scrolling/polling never retries it in a loop.
export function watchDiffGrammarRequests(document: GrammarDocument, onLanguage: (language: string) => void) {
  let active = true;
  const requested = new Set<string>();
  const subscriptions: (() => void)[] = [];
  const check = () => {
    for (const language of document.getMissingSyntaxLanguages()) {
      if (!isKnownGrammar(language) || requested.has(language)) continue;
      requested.add(language);
      onLanguage(language);
      let refreshed = false;
      const refresh = () => {
        if (active && !refreshed && treeGrammarManager.getSnapshot(language).phase === "ready") {
          refreshed = true;
          document.refreshSyntaxGrammars();
        }
      };
      subscriptions.push(treeGrammarManager.subscribe(language, refresh));
      if (treeGrammarManager.getSnapshot(language).phase === "error") continue;
      void treeGrammarManager.ensure(language).then(refresh).catch(() => {});
    }
  };
  const timer = setInterval(check, 250);
  check();
  return () => { active = false; clearInterval(timer); subscriptions.forEach((unsubscribe) => unsubscribe()); };
}
