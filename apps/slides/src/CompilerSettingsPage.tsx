import { useValue } from "@legendapp/state/react";
import { SettingsRow, SettingsSection } from "@legendapp/spark/settings/window";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { compilerRuntime$, resolveCompilerRuntime, setCustomCompilerRuntime } from "./compilerRuntime";
import { pinnedBun } from "./compilerRuntimeCore";
import { chooseOwnRuntime, downloadRuntimeAndRetry, RuntimeButton } from "./CompilerRuntimePrompt";
import { useCompilerRuntimePathSetting } from "./slidesSettings";

const sourceLabel = { custom: "your choice", downloaded: "downloaded by Legend Slides", system: "found on this Mac" } as const;

export function CompilerSettingsPage() {
  const status = useValue(compilerRuntime$.status), runtime = useValue(compilerRuntime$.runtime);
  const progress = useValue(compilerRuntime$.progress), error = useValue(compilerRuntime$.error);
  const customPath = useCompilerRuntimePathSetting();
  useEffect(() => { if (compilerRuntime$.status.peek() === "unknown") void resolveCompilerRuntime(); }, []);
  const busy = status === "downloading" || status === "checking";
  const summary = status === "downloading" ? `Downloading Bun ${pinnedBun.version}… ${Math.round(progress * 100)}%`
    : status === "checking" ? "Looking for Bun or Node…"
    : runtime ? `${runtime.kind === "bun" ? "Bun" : "Node"} ${runtime.version} (${sourceLabel[runtime.source]})`
    : "No runtime found. Decks can't compile until you download Bun or choose your own.";
  return <SettingsSection first title="Deck Compiler">
    <SettingsRow title="JavaScript Runtime" description={runtime?.path ?? "Legend Slides compiles decks with Bun 1.3+ or Node 22+."}
      control={<Text className="text-sm text-foreground" style={{ maxWidth: 260 }}>{summary}</Text>} />
    {status === "error" && <SettingsRow title="Download Failed" description={error} control={null} />}
    <SettingsRow title="Bundled Download" description={`Install Bun ${pinnedBun.version} from GitHub into Application Support. Verified with a SHA-256 checksum built into the app.`}
      control={<View className="flex-row gap-2">
        <RuntimeButton title={runtime?.source === "downloaded" ? "Reinstall" : status === "error" ? "Try Again" : "Download Bun"} disabled={busy} onPress={() => void downloadRuntimeAndRetry()} />
      </View>} />
    <SettingsRow title="Use My Own" description={customPath ? `Using ${customPath}` : "Pick a bun or node executable instead of automatic detection."}
      control={<View className="flex-row gap-2">
        <RuntimeButton title="Choose…" disabled={busy} onPress={() => void chooseOwnRuntime()} />
        {customPath ? <RuntimeButton title="Automatic" disabled={busy} onPress={() => void setCustomCompilerRuntime(null)} /> : null}
        <RuntimeButton title="Detect Again" disabled={busy} onPress={() => void resolveCompilerRuntime({ refresh: true })} />
      </View>} />
  </SettingsSection>;
}
