import { exists, getDirectory, list, readText } from "@legendapp/spark/files";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { validatePin, validPackId, type EffectCatalog, type EffectListing, type PackPin } from "../../../packages/presentation/src/effectPacks/schema";
import { runCompilerCommand } from "./compilerCommand";
import { parseCompilerResult } from "./deckLoader";

export type EffectPackState = "available" | "installed" | "update";
export type EffectPackRow = { id: string; latest?: string; installed?: PackPin; state: EffectPackState; effects: EffectListing[] };

/** The compiler installs into ~/Library/Application Support/Legend Slides/effects; data is Application Support/<app>. */
export async function effectsDirectory() {
  if (process.env.LEGEND_SLIDES_EFFECT_PACKS) return process.env.LEGEND_SLIDES_EFFECT_PACKS;
  const data = await getDirectory("data");
  const library = data.indexOf("/Library/");
  if (library < 0) throw new Error("Could not locate the effects folder in Application Support.");
  return `${data.slice(0, library)}/Library/Application Support/Legend Slides/effects`;
}

/** Read each pack's default selection without the compiler, so installed packs stay visible offline. */
export async function readInstalledEffectPacks(directory: string) {
  const installed: Record<string, PackPin> = {};
  if (!await exists(directory)) return installed;
  for (const entry of await list(directory)) {
    const active = `${directory}/${entry.name}/active.json`;
    if (!validPackId(entry.name) || !await exists(active)) continue;
    try {
      const pin = JSON.parse(await readText(active)) as PackPin;
      validatePin(pin);
      installed[entry.name] = { version: pin.version, sha256: pin.sha256 };
    } catch { /* A damaged selection is reinstalled from the catalog. */ }
  }
  return installed;
}

export async function loadEffectCatalog() {
  const output = await runCompilerCommand(["--effect-catalog"], { timeoutMs: 45_000 });
  if (output.timedOut) throw new Error("The effect catalog did not respond.");
  const result = parseCompilerResult(decodeProcessText(output.stdout)) as unknown as { success: boolean; errors?: string[]; catalog?: EffectCatalog; url?: string };
  if (!result.success || !result.catalog || !result.url) throw new Error(result.errors?.join("\n") || "Could not load the effect catalog.");
  return { catalog: result.catalog, url: result.url };
}

export function effectPackRows(catalog: EffectCatalog | null, installed: Record<string, PackPin>): EffectPackRow[] {
  const ids = [...new Set([...Object.keys(catalog?.packs ?? {}), ...Object.keys(installed)])].sort();
  return ids.map(id => {
    const latest = catalog?.packs[id]?.latest, pin = installed[id];
    const state = !pin ? "available" : latest && (pin.version !== latest || pin.sha256 !== catalog!.packs[id].versions[latest].sha256) ? "update" : "installed";
    return { id, latest, installed: pin, state, effects: catalog?.effects.filter(effect => effect.pack === id) ?? [] };
  });
}

/** Previews are served beside the catalog. Hermes' URL shim can't resolve relative URLs. */
export function catalogResource(resource: string, catalogURL: string) {
  const origin = /^https?:\/\/[^/]+/.exec(catalogURL)?.[0];
  if (!origin) return undefined;
  if (resource.startsWith("/")) return resource.startsWith("//") ? undefined : origin + resource;
  if (/^[a-z][a-z0-9+.-]*:/i.test(resource)) return resource.startsWith(`${origin}/`) ? resource : undefined;
  return catalogURL.replace(/[^/]*$/, "") + resource;
}
