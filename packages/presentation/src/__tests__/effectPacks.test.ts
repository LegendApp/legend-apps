// @ts-nocheck Bun test globals follow the repository test setup.
import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileDeck } from "../compiler";
import { resolveEffectPack } from "../compiler/effectPacks";
import { effectPackIncompatibility } from "../effectPacks/schema";

const temporary = [];
function fixture(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-packs-"));
  temporary.push(root);
  const packs = path.join(root, "packs");
  const files = {
    "deck/deck.mdx": 'export { sample } from "slides:motion/Pose"\n\n# Optional',
    "packs/motion/pack.json": JSON.stringify({ id: "motion", version: "1.0.0", hostApiVersion: 1, exports: { Pose: "./Pose.ts" } }),
    "packs/motion/Pose.ts": 'import { twice } from "./math"; export function sample(x) { "worklet"; return twice(x); }',
    "packs/motion/math.ts": 'export function twice(x) { "worklet"; return x * 2; }',
    "outside.ts": 'export const privateData = "outside";',
    ...extra,
  };
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return { root, packs, deck: path.join(root, "deck/deck.mdx") };
}
afterEach(() => { for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

test("optional packs use the deck worklet compiler and track their source and manifest", async () => {
  const { deck, packs } = fixture();
  const result = await compileDeck(deck, { effectPacksDirectory: packs });
  expect(result.success).toBe(true);
  if (!result.success) throw Error(result.errors.join("\n"));
  expect(result.code).toContain("__workletHash");
  expect(result.dependencies).toContain(path.join(packs, "motion/pack.json"));
  expect(result.dependencies).toContain(path.join(packs, "motion/math.ts"));
  const module = { exports: {} };
  Function("require", "module", "exports", result.code)(() => ({}), module, module.exports);
  expect(module.exports.sample(21)).toBe(42);
});

test("pack imports do not relax deck or pack containment", async () => {
  for (const source of ['export { privateData } from "../../outside";', 'export { privateData } from "./escape";']) {
    const { root, deck, packs } = fixture({ "packs/motion/Pose.ts": source });
    fs.symlinkSync(path.join(root, "outside.ts"), path.join(packs, "motion/escape.ts"));
    const result = await compileDeck(deck, { effectPacksDirectory: packs });
    expect(result.success).toBe(false);
    expect(result.errors.join("\n")).toContain("escapes the library directory");
  }
  const { deck, packs } = fixture({ "deck/deck.mdx": 'export { sample } from "../packs/motion/Pose"\n\n# Escape' });
  const result = await compileDeck(deck, { effectPacksDirectory: packs });
  expect(result.success).toBe(false);
  expect(result.errors.join("\n")).toContain("escapes the deck directory");
});

test("manifests reject missing, incompatible, unexported and escaping entries", () => {
  const { packs, root } = fixture();
  for (const ref of ["slides:missing/Pose", "slides:motion/Unknown", "slides:../motion/Pose", "slides:motion/../Pose", "slides:motion/__proto__"]) {
    expect(() => resolveEffectPack(ref, packs)).toThrow();
  }
  const manifest = path.join(packs, "motion/pack.json");
  fs.writeFileSync(manifest, JSON.stringify({ id: "motion", version: "1.0.0", hostApiVersion: 3, exports: { Pose: "./Pose.ts" } }));
  expect(() => resolveEffectPack("slides:motion/Pose", packs)).toThrow("incompatible");
  fs.writeFileSync(manifest, JSON.stringify({ id: "motion", version: "1.0.0", hostApiVersion: 1, exports: { Pose: "../../outside.ts" } }));
  expect(() => resolveEffectPack("slides:motion/Pose", packs)).toThrow();
});

test("cross-pack imports require declared dependency versions and track both roots", async () => {
  const { deck, packs } = fixture({
    "packs/motion/Pose.ts": 'export { sample } from "slides:math/Twice";',
    "packs/math/pack.json": JSON.stringify({ id: "math", version: "1.0.0", hostApiVersion: 1, exports: { Twice: "./Twice.ts" } }),
    "packs/math/Twice.ts": 'export function sample(x) { "worklet"; return x * 2; }',
  });
  let result = await compileDeck(deck, { effectPacksDirectory: packs });
  expect(result.success).toBe(false);
  expect(result.errors.join("\n")).toContain("does not declare");
  const manifest = path.join(packs, "motion/pack.json");
  const config = JSON.parse(fs.readFileSync(manifest, "utf8"));
  config.dependencies = { math: "2.0.0" };
  fs.writeFileSync(manifest, JSON.stringify(config));
  result = await compileDeck(deck, { effectPacksDirectory: packs });
  expect(result.success).toBe(false);
  expect(result.errors.join("\n")).toContain("version 2.0.0");
  config.dependencies.math = "1.0.0";
  fs.writeFileSync(manifest, JSON.stringify(config));
  result = await compileDeck(deck, { effectPacksDirectory: packs });
  expect(result.success).toBe(true);
  expect(result.dependencies).toContain(path.join(packs, "motion/pack.json"));
  expect(result.dependencies).toContain(path.join(packs, "math/pack.json"));
});

test("local pack manifests reject capabilities absent from this host before evaluation", async () => {
  for (const requirements of [{ hostApiVersion: 3, capabilities: [] }, { hostApiVersion: 1, capabilities: ["unknown-engine"] }]) {
    const { deck, packs } = fixture({
      "packs/motion/pack.json": JSON.stringify({ id: "motion", version: "1.0.0", ...requirements, exports: { Pose: "./Pose.ts" } }),
      "packs/motion/Pose.ts": 'throw new Error("must never evaluate"); export const sample = 1;',
    });
    const result = await compileDeck(deck, { effectPacksDirectory: packs });
    expect(result.success).toBe(false);
    expect(result.errors.join("\n")).toContain("incompatible");
    expect(result.errors.join("\n")).not.toContain("must never evaluate");
  }
});

test("the signed host retains every capability required by the current source packs", () => {
  const packs = path.resolve(import.meta.dirname, "../../../slides-effects/packs");
  for (const id of fs.readdirSync(packs)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(packs, id, "pack.json"), "utf8"));
    expect(effectPackIncompatibility(manifest)).toBeUndefined();
  }
});

test("host API 2 accepts multipass packs while retaining API 1", () => {
  expect(effectPackIncompatibility({ hostApiVersion: 2, capabilities: ["webgpu", "webgpu-multipass", "reanimated"] })).toBeUndefined();
  expect(effectPackIncompatibility({ hostApiVersion: 1, capabilities: ["webgpu"] })).toBeUndefined();
  for (const hostApiVersion of [0, 1.5, 3]) expect(effectPackIncompatibility({ hostApiVersion })).toContain("this app provides 2");
});
