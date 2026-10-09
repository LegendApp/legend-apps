import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function defaultEffectPacksDirectory() {
  const source = path.resolve(import.meta.dirname, "../../../slides-effects/packs");
  return process.env.LEGEND_SLIDES_EFFECT_PACKS ?? (fs.existsSync(source) ? source
    : path.join(os.homedir(), "Library/Application Support/Legend Slides/effects"));
}

export function resolveEffectPack(reference: string, directory: string, importerPackRoot?: string) {
  const match = /^slides:([a-z][a-z0-9-]*)\/([A-Za-z][A-Za-z0-9-]*)$/.exec(reference);
  if (!match) throw new Error(`Invalid effect pack reference "${reference}".`);
  const [, id, entry] = match;
  const manifest = path.join(directory, id, "pack.json");
  if (!fs.existsSync(manifest)) throw new Error(`Effect pack "${id}" is not installed. Install it in ${directory}.`);
  const root = fs.realpathSync(path.dirname(manifest));
  const config = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (config.id !== id || config.hostApiVersion !== 1 || typeof config.version !== "string") {
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
  return { file, root, manifest };
}
