#!/usr/bin/env bun
import { copyTransitionToDeck } from "../packages/presentation/src/compiler/exportTransition";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { compileDeck } from "../packages/presentation/src/compiler";
import { effectCatalogURL, installEffectPacks, installEffectExample, loadEffectCatalog, removeEffectPack, type EffectInstallProgress } from "../packages/presentation/src/effectPacks/install";
import { parseEffectAction } from "../packages/presentation/src/effectPacks/protocol";
import { getDeckSourceStructure } from "../packages/presentation/src/speakerNotesSource";
import { cleanupExports, describeExportError, exportSteps, exportWebsite, ExportError } from "../packages/slides-web/export";

const exportFlag = process.argv.indexOf("--export-html");
if (exportFlag >= 0) process.once("SIGTERM", () => { cleanupExports(); process.exit(143); });

const deckPath = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
const source = process.argv.includes("--draft") ? readFileSync(0, "utf8") : undefined;
const transitionFlag = process.argv.indexOf("--transitions");
const transitionDirectory = transitionFlag >= 0 ? process.argv[transitionFlag + 1] : undefined;
const packsFlag = process.argv.indexOf("--effect-packs");
const effectPacksDirectory = packsFlag >= 0 ? process.argv[packsFlag + 1] : undefined;
const copyFlag = process.argv.indexOf("--copy-transition");
// The app reads one JSON line per progress update from stderr.
const onProgress = (progress: EffectInstallProgress) => process.stderr.write(`${JSON.stringify({ effectProgress: progress })}\n`);
async function execute() {
  if (process.argv.includes("--effect-catalog")) return { success: true, catalog: await loadEffectCatalog(), url: effectCatalogURL() };
  const removeFlag = process.argv.indexOf("--remove-effect");
  if (removeFlag >= 0) { await removeEffectPack(process.argv[removeFlag + 1], { directory: effectPacksDirectory }); return { success: true }; }
  const actionFlag = process.argv.indexOf("--effect-action");
  if (actionFlag >= 0) {
    const action = parseEffectAction(process.argv[actionFlag + 1]);
    if (action.type === "example") return { success: true, path: await installEffectExample(action.effect, { directory: effectPacksDirectory }) };
    const catalog = await loadEffectCatalog();
    const release = catalog.packs[action.pack]?.versions[action.version];
    if (!release) throw new Error("The requested pack version is not in the catalog.");
    const installed = await installEffectPacks([action.pack], { directory: effectPacksDirectory, requested: { [action.pack]: release }, onProgress });
    return { success: true, installed: Object.keys(installed.lock.packs) };
  }
  if (!deckPath) return { success: false, errors: ["Usage: bun scripts/compile-slides.ts <deck.mdx> [--install-effects]"], warnings: [] };
  if (copyFlag >= 0) return { success: true, copy: await copyTransitionToDeck(deckPath, process.argv[copyFlag + 1], transitionDirectory!) };
  if (exportFlag >= 0) {
    const destination = process.argv[exportFlag + 1];
    if (!destination || destination.startsWith("--")) throw new Error("Choose a destination folder for the HTML export.");
    try {
      const output = await exportWebsite(deckPath, destination, { transitionDirectory, effectPacksDirectory,
        onProgress: step => process.stderr.write(`${JSON.stringify({ exportProgress: { step, steps: exportSteps.length, label: exportSteps[step] } })}\n`) });
      return { success: true, path: output, warnings: JSON.parse(readFileSync(`${output}/export.json`, "utf8")).warnings };
    } catch (error) {
      return { success: false, errors: [describeExportError(error)], missingEffectPacks: error instanceof ExportError ? error.missingEffectPacks : [] };
    }
  }
  let result = await compileDeck(deckPath, { source, transitionDirectory, effectPacksDirectory });
  if (process.argv.includes("--install-effects")) {
    if (!result.effectPackIds?.length) return result;
    await installEffectPacks(result.effectPackIds, { directory: effectPacksDirectory, deck: deckPath, onProgress });
    result = await compileDeck(deckPath, { source, transitionDirectory, effectPacksDirectory });
  }
  return result;
}
const result = await execute().catch(error => ({ success: false, errors: [String(error)], warnings: [] }));
let sourceSlideEnds: number[] | undefined;
if (source !== undefined) {
  try { sourceSlideEnds = getDeckSourceStructure(source).slides.map((slide) => slide.end); }
  catch { /* Keep the last useful index while frontmatter is incomplete. */ }
}

process.stdout.write(JSON.stringify({
  data: gzipSync(JSON.stringify({ ...result, sourceSlideEnds })).toString("base64"),
  encoding: "gzip-base64",
}));
