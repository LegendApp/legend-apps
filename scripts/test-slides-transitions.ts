import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileDeck } from "../packages/presentation/src/compiler/compileDeck";
import { copyTransitionToDeck } from "../packages/presentation/src/compiler/exportTransition";
import { resolveTransitionFile } from "../packages/presentation/src/compiler/transitionLibrary";

const cases: { name: string; run: () => void | Promise<void> }[] = [];
function test(name: string, run: () => void | Promise<void>) { cases.push({ name, run }); }
const folders: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slide-transitions-")); folders.push(root);
  const deck = path.join(root, "deck"); const library = path.join(root, "library");
  fs.mkdirSync(deck); fs.mkdirSync(library);
  return { root, deck: path.join(deck, "talk.mdx"), library };
}


test("compiles referenced library transitions and helpers, ignores unrelated broken files, and exports a portable copy", async () => {
  const f = fixture();
  fs.writeFileSync(f.deck, '---\ntransition:\n  name: custom\n  duration: 800\n  options:\n    distance: 40\n---\n# Hello\n');
  fs.writeFileSync(path.join(f.library, "custom.ts"), 'import { distance } from "./helper"; export default { duration: 650, styles({progress}) { return { incoming: { opacity: progress, transform: [{translateY: distance * (1-progress)}] }, outgoing: {opacity: 1-progress} }; } };');
  fs.writeFileSync(path.join(f.library, "helper.ts"), 'export const distance = 24;');
  fs.writeFileSync(path.join(f.library, "unused.ts"), 'this is invalid source!!!');
  const result = await compileDeck(f.deck, { transitionDirectory: f.library });
  assert.equal(result.success, true, JSON.stringify(result));
  if (result.success) {
    assert.ok(result.dependencies.includes(path.join(f.library, "helper.ts")));
    assert.ok(result.code.includes("__legendSlidesTransitions"));
  }
  const copy = await copyTransitionToDeck(f.deck, "custom", f.library);
  assert.ok(copy.updated.includes("source: ./"));
  assert.ok(copy.updated.includes("duration: 800"));
  assert.ok(copy.updated.includes("distance: 40"));
  assert.equal(fs.readFileSync(f.deck, "utf8"), copy.original);
  fs.writeFileSync(f.deck, copy.updated);
  fs.rmSync(f.library, { recursive: true });
  const fallback = await compileDeck(f.deck);
  assert.equal(fallback.success, true, JSON.stringify(fallback));
});

test("rejects missing names, traversal, and symlink escapes", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.root, "outside.ts"), "export default {};");
  fs.symlinkSync(path.join(f.root, "outside.ts"), path.join(f.library, "escape.ts"));
  assert.throws(() => resolveTransitionFile("escape", path.dirname(f.deck), f.library), /escapes/);
  assert.throws(() => resolveTransitionFile("../outside", path.dirname(f.deck), f.library), /Invalid/);
  assert.throws(() => resolveTransitionFile("missing", path.dirname(f.deck), f.library), /not found/);
});

test("built-ins compile without a library and user edits override them", async () => {
  const f = fixture(); fs.writeFileSync(f.deck, '---\ntransition: reveal-up\n---\n# Test\n');
  const fallback = await compileDeck(f.deck);
  assert.equal(fallback.success, true, JSON.stringify(fallback));
  fs.writeFileSync(path.join(f.library, "reveal-up.ts"), 'export default { styles() { return { incoming: {opacity: 0.731}, outgoing: {} }; } };');
  const result = await compileDeck(f.deck, { transitionDirectory: f.library });
  assert.equal(result.success, true, JSON.stringify(result));
  if (result.success) assert.ok(result.code.includes("0.731"));
});

for (const entry of cases) {
  try { await entry.run(); console.log(`PASS ${entry.name}`); }
  finally { folders.splice(0).forEach((folder) => fs.rmSync(folder, { recursive: true, force: true })); }
}
