import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { treeGrammarManager } from "@legend-apps/syntax-parser";
import { useGrammarProgress } from "./useTreeGrammar";
import { progressBannerStyles as styles } from "./SourceProgressBanner";
import { SourceProgressBanner } from "./SourceProgressBanner";
import type { createSourceProgress } from "./sourceProgress";

export function GrammarProgressBanner({ languages, progress, loading, showFileLoadingBanner }: {
  languages: readonly string[]; progress: ReturnType<typeof createSourceProgress>; loading: boolean; showFileLoadingBanner?: boolean;
}) {
  const state = useGrammarProgress(languages);
  if (!state || state.phase === "checking") return <SourceProgressBanner progress={progress} loading={loading} showFileLoadingBanner={showFileLoadingBanner} />;
  const language = state.language;
  const percent = state.total > 0 ? Math.floor(Math.min(1, state.completed / state.total) * 100) : undefined;
  const label = state.phase === "error" ? state.error
    : `Downloading ${language} grammar…${percent === undefined ? "" : ` ${percent}%`}`;
  return <View style={styles.banner} pointerEvents="box-none">
    <View style={styles.surface} accessibilityRole={state.phase === "error" ? "alert" : "progressbar"}
      accessibilityLabel={label} accessibilityValue={percent === undefined ? undefined : { min: 0, max: 100, now: percent }}>
      {state.phase !== "error" && <ActivityIndicator size="small" color="#60a5fa" />}
      <Text style={styles.text}>{label}</Text>
      {state.phase === "error" && <Pressable accessibilityRole="button" accessibilityLabel="Retry grammar download"
        onPress={() => { void treeGrammarManager.ensure(language).catch(() => {}); }}><Text style={styles.text}>Retry</Text></Pressable>}
    </View>
  </View>;
}
