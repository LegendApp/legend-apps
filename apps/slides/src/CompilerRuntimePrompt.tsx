import { useValue } from "@legendapp/state/react";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { Pressable, Text, View } from "react-native";
import { compilerRuntime$, changeCompilerRuntime, resolveCompilerRuntime, downloadCompilerRuntime, setCustomCompilerRuntime } from "./compilerRuntime";
import { pinnedBun } from "./compilerRuntimeCore";

export function detectRuntimeAndRetry() {
  return changeCompilerRuntime(() => resolveCompilerRuntime({ refresh: true }));
}

export function automaticRuntimeAndRetry() {
  return changeCompilerRuntime(() => setCustomCompilerRuntime(null));
}

export function downloadRuntimeAndRetry(force = false) {
  return changeCompilerRuntime(() => downloadCompilerRuntime({ force }));
}

export async function chooseOwnRuntime() {
  const picked = await openFileDialog({ selection: "files", multiple: false, defaultPath: "/opt/homebrew/bin",
    message: "Choose a Bun 1.3+ or Node 22+ executable", prompt: "Use Runtime" });
  const path = picked.canceled ? undefined : picked.paths[0];
  if (!path) return;
  try {
    await changeCompilerRuntime(() => setCustomCompilerRuntime(path));
  } catch (error) {
    compilerRuntime$.assign({ status: "error", error: error instanceof Error ? error.message : String(error) });
  }
}

export function RuntimeButton({ title, onPress, disabled }: { title: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress}
    style={{ alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 7, backgroundColor: "#303948", opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: "#e0f2fe", fontSize: 13, fontWeight: "600" }}>{title}</Text>
  </Pressable>;
}

export function runtimeStatusText(status: string, error: string, arch: "arm64" | "x64" | null) {
  if (status === "downloading") return "Preparing the compiler. This deck will retry when it finishes…";
  if (status === "checking") return "Looking for Bun or Node…";
  if (status === "error") return error;
  return `This deck needs a JavaScript runtime to compile. Download Bun (${arch ? `about ${Math.round(pinnedBun.bytes[arch] / 1_000_000)} MB, ` : ""}once) or use your own Bun 1.3+ or Node 22+.`;
}

/** Both windows render the same install progress, including when Settings opens mid-download. */
export function CompilerRuntimeProgress({ textColor }: { textColor?: string }) {
  const progress = useValue(compilerRuntime$.progress);
  const percent = Math.round((progress?.fraction ?? 0) * 100);
  const text = !progress ? "Preparing Bun download…"
    : progress.phase === "verifying" ? "Verifying Bun download…"
    : progress.phase === "installing" ? "Installing Bun…"
    : `Downloading Bun ${pinnedBun.version}… ${Math.round(progress.fraction * progress.totalBytes).toLocaleString()} / ${progress.totalBytes.toLocaleString()} bytes (${percent}%)`;
  return <View className="gap-2">
    <Text className="text-sm text-foreground" style={textColor ? { color: textColor } : undefined}>{text}</Text>
    <View accessibilityRole="progressbar" accessibilityLabel={text} accessibilityValue={{ min: 0, max: 100, now: percent }} className="h-1 rounded bg-[#303948]">
      <View className="h-1 rounded bg-[#7dd3fc]" style={{ width: `${percent}%` }} />
    </View>
  </View>;
}

/** Shown over the presenter when a deck can't compile because no runtime is installed. */
export function CompilerRuntimePrompt() {
  const retry = useValue(compilerRuntime$.retryDeck), status = useValue(compilerRuntime$.status);
  const arch = useValue(compilerRuntime$.arch);
  const error = useValue(compilerRuntime$.error);
  if (!retry || status === "ready") return null;
  const busy = status === "downloading" || status === "checking";
  return <View style={{ position: "absolute", bottom: 18, left: 18, right: 18, zIndex: 21, padding: 16, borderRadius: 10, backgroundColor: "#20242c", gap: 10 }}>
    <Text style={{ color: "#fafafa", fontSize: 14 }}>{runtimeStatusText(status, error, arch)}</Text>
    {status === "downloading" && <CompilerRuntimeProgress textColor="#fafafa" />}
    <View style={{ flexDirection: "row", gap: 8 }}>
      <RuntimeButton title={status === "error" ? "Try Again" : "Download Bun"} disabled={busy} onPress={() => void downloadRuntimeAndRetry()} />
      <RuntimeButton title="Detect Again" disabled={busy} onPress={() => void detectRuntimeAndRetry()} />
      <RuntimeButton title="Use My Own Bun or Node…" disabled={busy} onPress={() => void chooseOwnRuntime()} />
    </View>
  </View>;
}
