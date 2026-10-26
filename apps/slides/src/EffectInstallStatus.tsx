import { useValue } from "@legendapp/state/react";
import { Pressable, Text, View } from "react-native";
import { loadDeck } from "./deckLoader";
import { runEffectCommand } from "./effectCommands";
import { effectRequests$ } from "./effectRequests";
import { CompilerRuntimePrompt, CompilerDownloadPrompt } from "./CompilerRuntimePrompt";
export function EffectInstallStatus() {
  return <><CompilerRuntimePrompt /><CompilerDownloadPrompt /><EffectPackStatus /></>;
}

function EffectPackStatus() {
  const pending = useValue(effectRequests$.pending), busy = useValue(effectRequests$.busy);
  const message = useValue(effectRequests$.message), error = useValue(effectRequests$.error);
  const settings = useValue(effectRequests$.source) === "settings";
  const needs = pending && `This deck needs optional effects: ${pending.packs.join(", ")}`;
  if (!pending && (settings || !busy && !message && !error)) return null;
  return <View style={{ position: "absolute", bottom: 18, left: 18, right: 18, zIndex: 20, padding: 16, borderRadius: 10, backgroundColor: "#20242c", gap: 10 }}>
    <Text style={{ color: "#fafafa", fontSize: 14 }}>{settings ? needs : busy ? message : error || needs || message}</Text>
    {pending && <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel="Install Required Effects" onPress={async () => {
      try { await runEffectCommand([pending.path, "--install-effects"], "Installing required effects…"); if (effectRequests$.pending.peek()?.path === pending.path) await loadDeck(pending.path); }
      catch { /* The status preserves the retry action and shows the error. */ }
    }} style={{ alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 7, backgroundColor: "#303948", opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: "#e0f2fe", fontSize: 13, fontWeight: "600" }}>{busy ? "Installing…" : "Install Required Effects"}</Text>
    </Pressable>}
    {!busy && !pending && <Pressable accessibilityRole="button" onPress={() => effectRequests$.assign({ message: "", error: "", progress: null })}><Text style={{ color: "#a5b4fc" }}>Dismiss</Text></Pressable>}
  </View>;
}
