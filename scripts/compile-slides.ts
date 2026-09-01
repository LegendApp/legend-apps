#!/usr/bin/env bun
import { compileDeck } from "../packages/presentation/src/compiler";

const deckPath = process.argv[2];
const result = deckPath
  ? await compileDeck(deckPath)
  : { success: false as const, errors: ["Usage: bun scripts/compile-slides.ts <deck.mdx>"], warnings: [] };

process.stdout.write(JSON.stringify(result));
