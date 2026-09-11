import { NitroModules } from "react-native-nitro-modules";
import type { SyntaxParser } from "./SyntaxParser.nitro";
import { createGrammarManager, validateGrammarManifest } from "./grammarDownloads";
import { getSyntaxAssetStorage } from "./syntaxAssets";

let native: SyntaxParser | undefined;
const parser = () => native ??= NitroModules.createHybridObject<SyntaxParser>("SyntaxParser");
async function getJSON(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw Error(`Grammar catalog unavailable (HTTP ${response.status})`);
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) throw Error("Grammar catalog exceeds size limit");
    return JSON.parse(text);
  } finally { clearTimeout(timer); }
}
async function fetchLatestManifest() {
  const channel = await getJSON("https://raw.githubusercontent.com/LegendApp/legend-apps/main/grammars/channel.json");
  if (channel.schemaVersion !== 1 || typeof channel.releaseVersion !== "string"
    || !/^[a-z0-9][a-z0-9.-]*$/.test(channel.releaseVersion)) throw Error("No grammar release has been published yet");
  const manifest = validateGrammarManifest(await getJSON(`https://github.com/LegendApp/legend-apps/releases/download/grammars-v${channel.releaseVersion}/manifest.json`));
  if (manifest.version !== channel.releaseVersion) throw Error("Grammar channel and manifest versions do not match");
  getSyntaxAssetStorage().write("tree-grammar-manifest.json", manifest, { format: "json" });
  return manifest;
}
export const treeGrammarManager = createGrammarManager({
  platform: () => parser().getGrammarPlatform(),
  loaded: (name) => parser().isTreeGrammarLoaded(name),
  async manifest(refresh = false) {
    const storage = getSyntaxAssetStorage();
    const cached = storage.read("tree-grammar-manifest.json", { format: "json" });
    // Offline startup must not wait for a network timeout. Existing compatible
    // manifests are usable immediately; check for updates separately.
    if (cached && !refresh) {
      try {
        const manifest = validateGrammarManifest(cached);
        void fetchLatestManifest().catch(() => {});
        return manifest;
      } catch { /* Replace incompatible metadata. */ }
    }
    return fetchLatestManifest();
  },
  install: (name, artifact, progress) => parser().installTreeGrammar(name, artifact.url, artifact.sha256, artifact.bytes, progress),
});
