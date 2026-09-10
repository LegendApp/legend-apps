#!/usr/bin/env bun
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { compileDeck } from "../packages/presentation/src/compiler";

const deckPath = process.argv[2];
const result = deckPath
  ? await compileDeck(deckPath, process.argv.includes("--draft") ? { source: readFileSync(0, "utf8") } : {})
  : { success: false as const, errors: ["Usage: bun scripts/compile-slides.ts <deck.mdx>"], warnings: [] };

process.stdout.write(JSON.stringify({
  data: gzipSync(JSON.stringify(result)).toString("base64"),
  encoding: "gzip-base64",
}));
