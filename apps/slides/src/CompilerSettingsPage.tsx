import { useValue } from "@legendapp/state/react";
import { SettingsRow, SettingsSection } from "@legendapp/spark/ui/settings";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { compilerRuntime$, resolveCompilerRuntime } from "./compilerRuntime";
import { pinnedBun } from "./compilerRuntimeCore";
import { chooseOwnRuntime, detectRuntimeAndRetry, automaticRuntimeAndRetry, downloadRuntimeAndRetry, RuntimeButton, CompilerRuntimeProgress } from "./CompilerRuntimePrompt";
import { useCompilerRuntimePathSetting } from "./slidesSettings";

const sourceLabel = { custom: "your choice", downloaded: "downloaded by Legend Slides", system: "found on this Mac" } as const;

export function CompilerSettingsPage() {
  const status = useValue(compilerRuntime$.status), runtime = useValue(compilerRuntime$.runtime);
  const error = useValue(compilerRuntime$.error);
  const customPath = useCompilerRuntimePathSetting();
  useEffect(() => { if (compilerRuntime$.status.peek() === "unknown") void resolveCompilerRuntime(); }, []);
  const busy = status === "downloading" || status === "checking";
  const summary = status === "checking" ? "Looking for Bun or Node…"
    : runtime ? `${runtime.kind === "bun" ? "Bun" : "Node"} ${runtime.version} (${sourceLabel[runtime.source]})`
    : "No runtime found. Decks can't compile until you download Bun or choose your own.";
  return <SettingsSection title="Deck Compiler">
    <SettingsRow label="JavaScript Runtime" description={runtime?.path ?? "Legend Slides compiles decks with Bun 1.3+ or Node 22+."}>
      {status === "downloading" ? <View className="w-64"><CompilerRuntimeProgress /></View> : <Text className="text-sm text-foreground" style={{ maxWidth: 260 }}>{summary}</Text>}
    </SettingsRow>
    {status === "error" && <SettingsRow label="Download Failed" description={error} />}
    <SettingsRow label="Bundled Download" description={`Install Bun ${pinnedBun.version} from GitHub into Application Support. Verified with a SHA-256 checksum built into the app.`}>
      <View className="flex-row gap-2">
        <RuntimeButton title={runtime?.source === "downloaded" ? "Reinstall" : status === "error" ? "Try Again" : "Download Bun"} disabled={busy} onPress={() => void downloadRuntimeAndRetry(runtime?.source === "downloaded")} />
      </View>
    </SettingsRow>
    <SettingsRow label="Use My Own" description={customPath ? `Using ${customPath}` : "Pick a bun or node executable instead of automatic detection."}>
      <View className="flex-row gap-2">
        <RuntimeButton title="Choose…" disabled={busy} onPress={() => void chooseOwnRuntime()} />
        {customPath ? <RuntimeButton title="Automatic" disabled={busy} onPress={() => void automaticRuntimeAndRetry()} /> : null}
        <RuntimeButton title="Detect Again" disabled={busy} onPress={() => void detectRuntimeAndRetry()} />
      </View>
    </SettingsRow>
  </SettingsSection>;
}
