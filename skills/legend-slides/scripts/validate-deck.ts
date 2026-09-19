#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const [deckArgument, checkoutArgument = process.cwd(), ...extra] = process.argv.slice(2);
if (!deckArgument || deckArgument === "--help" || extra.length) {
  console.log("Usage: bun validate-deck.ts <deck.mdx> [legend-apps-checkout]");
  process.exit(deckArgument === "--help" ? 0 : 2);
}
const deck = resolve(deckArgument);
const checkout = resolve(checkoutArgument);
const compiler = join(checkout, "packages/presentation/src/compiler/index.ts");
const structure = join(checkout, "packages/presentation/src/speakerNotesSource.ts");
if (!existsSync(deck) || !existsSync(compiler) || !existsSync(structure)) {
  console.error("Provide an existing deck and a Legend Apps checkout with dependencies installed.");
  process.exit(2);
}
try {
  const { compileDeck } = await import(pathToFileURL(compiler).href);
  const result = await compileDeck(deck);
  let slideCount: number | undefined;
  if (result.success) {
    const { getDeckSourceStructure } = await import(pathToFileURL(structure).href);
    slideCount = getDeckSourceStructure(readFileSync(deck, "utf8")).slides.length;
  }
  console.log(JSON.stringify({ deck, success: result.success, slideCount,
    errors: result.errors ?? [], warnings: result.warnings ?? [] }, null, 2));
  process.exitCode = result.success ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
