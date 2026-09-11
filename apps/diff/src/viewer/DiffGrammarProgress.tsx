import type { DiffDocument, DiffFileSummary } from "@legend-apps/diff-parser";
import { detectGrammar, treeGrammarManager, useGrammarProgress } from "@legend-apps/syntax-parser";
import { watchDiffGrammarRequests } from "./diffGrammarRequests";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export function DiffGrammarProgress({ document, files }: { document: DiffDocument; files: readonly DiffFileSummary[] }) {
  const [embedded, setEmbedded] = useState<string[]>([]);
  const primary = useMemo(() => [...new Set(files.flatMap((file) => [detectGrammar(file.path), detectGrammar(file.oldPath)]).filter(Boolean))], [files]);
  const languages = useMemo(() => [...new Set([...primary, ...embedded])], [primary, embedded]);
  const progress = useGrammarProgress(languages);
  useEffect(() => {
    setEmbedded([]);
    return watchDiffGrammarRequests(document, (language) => setEmbedded((names) => [...names, language]));
  }, [document]);
  if (!progress) return null;
  const percent = progress.total > 0 ? Math.min(100, Math.floor(progress.completed / progress.total * 100)) : undefined;
  const error = progress.phase === "error";
  const label = error ? progress.error : `${progress.phase === "checking" ? "Preparing" : "Downloading"} ${progress.language} grammar${percent === undefined ? "…" : `… ${percent}%`}`;
  return <View pointerEvents="box-none" className="absolute left-0 right-0 top-2 items-center">
    <View className="max-w-[95%] flex-row items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2"
      accessibilityRole={error ? "alert" : "progressbar"} accessibilityLabel={label}
      accessibilityValue={percent === undefined ? undefined : { min: 0, max: 100, now: percent }}>
      {!error && <ActivityIndicator size="small" />}
      <Text className="shrink text-sm text-white">{label}</Text>
      {error && <Pressable accessibilityRole="button" accessibilityLabel="Retry grammar download"
        onPress={() => { void treeGrammarManager.ensure(progress.language).catch(() => {}); }}>
        <Text className="text-sm text-blue-300">Retry</Text>
      </Pressable>}
    </View>
  </View>;
}
