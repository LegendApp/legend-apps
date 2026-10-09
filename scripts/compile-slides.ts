#!/usr/bin/env bun
import { copyTransitionToDeck } from "../packages/presentation/src/compiler/exportTransition";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { compileDeck } from "../packages/presentation/src/compiler";
import { installEffectPacks, installEffectExample, loadEffectCatalog } from "../packages/presentation/src/effectPacks/install";
import { parseEffectAction } from "../packages/presentation/src/effectPacks/protocol";
import { getDeckSourceStructure } from "../packages/presentation/src/speakerNotesSource";

const deckPath = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
const source = process.argv.includes("--draft") ? readFileSync(0, "utf8") : undefined;
const transitionFlag = process.argv.indexOf("--transitions");
const transitionDirectory = transitionFlag >= 0 ? process.argv[transitionFlag + 1] : undefined;
const packsFlag = process.argv.indexOf("--effect-packs");
const effectPacksDirectory = packsFlag >= 0 ? process.argv[packsFlag + 1] : undefined;
const copyFlag = process.argv.indexOf("--copy-transition");
async function execute() {
  const actionFlag = process.argv.indexOf("--effect-action");
  if (actionFlag >= 0) {
    const action = parseEffectAction(process.argv[actionFlag + 1]);
    if (action.type === "example") return { success: true, path: await installEffectExample(action.effect) };
    const catalog = await loadEffectCatalog();
    const release = catalog.packs[action.pack]?.versions[action.version];
    if (!release) throw new Error("The requested pack version is not in the catalog.");
    const installed = await installEffectPacks([action.pack], { requested: { [action.pack]: release } });
    return { success: true, installed: Object.keys(installed.lock.packs) };
  }
  if (!deckPath) return { success: false, errors: ["Usage: bun scripts/compile-slides.ts <deck.mdx> [--install-effects]"], warnings: [] };
  if (copyFlag >= 0) return { success: true, copy: await copyTransitionToDeck(deckPath, process.argv[copyFlag + 1], transitionDirectory!) };
  let result = await compileDeck(deckPath, { source, transitionDirectory, effectPacksDirectory });
  if (process.argv.includes("--install-effects")) {
    if (!result.effectPackIds?.length) return result;
    await installEffectPacks(result.effectPackIds, { directory: effectPacksDirectory, deck: deckPath });
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
