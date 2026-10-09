import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validatePin, type EffectLock, type PackPin } from "../effectPacks/schema";
import { pinnedPackDirectory, verifyInstalledPack } from "../effectPacks/storage";

export function defaultEffectPacksDirectory() {
  const source = path.resolve(import.meta.dirname, "../../../slides-effects/packs");
  return process.env.LEGEND_SLIDES_EFFECT_PACKS ?? (fs.existsSync(source) ? source
    : path.join(os.homedir(), "Library/Application Support/Legend Slides/effects"));
}

export class MissingEffectPack extends Error {
  constructor(public id: string, detail = "is not installed") { super(`Effect pack "${id}" ${detail}. Install the required effects before presenting.`); }
}
export function resolveEffectPack(reference: string, directory: string, importerPackRoot?: string, lock?: EffectLock,
  verified = new Set<string>()) {
  const match = /^slides:([a-z][a-z0-9-]*)\/([A-Za-z][A-Za-z0-9-]*)$/.exec(reference);
  if (!match) throw new Error(`Invalid effect pack reference "${reference}".`);
  const [, id, entry] = match;
  let pin: PackPin | undefined = lock?.packs[id];
  if (lock && !pin) throw new MissingEffectPack(id, "has no pinned version in this deck");
  const active = path.join(directory, id, "active.json");
  if (!pin && fs.existsSync(active)) pin = JSON.parse(fs.readFileSync(active, "utf8"));
  if (pin) validatePin(pin);
  const selected = pin ? pinnedPackDirectory(directory, id, pin) : path.join(directory, id);
  const manifest = path.join(selected, "pack.json");
  if (!fs.existsSync(manifest)) throw new MissingEffectPack(id, pin ? `version ${pin.version} is not installed` : undefined);
  if (pin && !verified.has(selected)) {
    if (!verifyInstalledPack(selected, pin)) throw new MissingEffectPack(id);
    verified.add(selected);
  }
  const root = fs.realpathSync(path.dirname(manifest));
  const config = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (config.id !== id || config.hostApiVersion !== 1 || typeof config.version !== "string" || (pin && config.version !== pin.version)) {
    throw new Error(`Effect pack "${id}" has an incompatible manifest.`);
  }
  if (importerPackRoot && importerPackRoot !== root) {
    const importer = JSON.parse(fs.readFileSync(path.join(importerPackRoot, "pack.json"), "utf8"));
    const expected = Object.hasOwn(importer.dependencies ?? {}, id) ? importer.dependencies[id] : undefined;
    if (!expected) throw new Error(`Effect pack "${importer.id}" does not declare its dependency on "${id}".`);
    if (expected !== config.version) throw new Error(`Effect pack "${importer.id}" requires "${id}" version ${expected}, but ${config.version} is installed.`);
  }
  const target = Object.hasOwn(config.exports ?? {}, entry) ? config.exports[entry] : undefined;
  if (typeof target !== "string" || !target.startsWith("./")) throw new Error(`Effect pack "${id}" does not export "${entry}".`);
  const file = fs.realpathSync(path.resolve(root, target));
  const relative = path.relative(root, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(file).isFile()) {
    throw new Error(`Effect pack "${id}" entry "${entry}" escapes its pack directory.`);
  }
  return { file, root, manifest, id, pin };
}
