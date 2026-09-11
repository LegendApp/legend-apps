#!/usr/bin/env bun
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { compileDeck } from "../packages/presentation/src/compiler";
import { getDeckSourceStructure } from "../packages/presentation/src/speakerNotesSource";

const deckPath = process.argv[2];
const source = process.argv.includes("--draft") ? readFileSync(0, "utf8") : undefined;
const result = deckPath
  ? await compileDeck(deckPath, source === undefined ? {} : { source })
  : { success: false as const, errors: ["Usage: bun scripts/compile-slides.ts <deck.mdx>"], warnings: [] };
let sourceSlideEnds: number[] | undefined;
if (source !== undefined) {
  try { sourceSlideEnds = getDeckSourceStructure(source).slides.map((slide) => slide.end); }
  catch { /* Keep the last useful index while frontmatter is incomplete. */ }
}

process.stdout.write(JSON.stringify({
  data: gzipSync(JSON.stringify({ ...result, sourceSlideEnds })).toString("base64"),
  encoding: "gzip-base64",
}));
