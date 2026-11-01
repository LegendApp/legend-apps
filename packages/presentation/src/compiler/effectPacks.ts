import fs from "node:fs";
import path from "node:path";
import { effectPackIncompatibility, isLocalPack, validSha, validVersion, validatePin, type EffectLock, type PackPin } from "../effectPacks/schema";
import { installedPacksDirectory, pinnedPackDirectory, verifyInstalledPack } from "../effectPacks/storage";

export function defaultEffectPacksDirectory() {
  return installedPacksDirectory();
}

export class MissingEffectPack extends Error {
  constructor(public id: string, detail = "is not installed") { super(`Effect pack "${id}" ${detail}. Install the required effects before presenting.`); }
}
/** A deck uses `<deck dir>/effects/<id>` or its lockfile's relative path from source, before installed packs. */
function localEffectPack(id: string, deckDirectory: string, locked?: EffectLock["packs"][string]) {
  const relative = isLocalPack(locked) ? locked.path : path.join("effects", id);
  if (fs.existsSync(path.join(deckDirectory, relative, "pack.json"))) return { path: relative };
  if (isLocalPack(locked)) throw new Error(`Local effect pack "${id}" was not found at ${locked.path}.`);
}
export function resolveEffectPack(reference: string, directory: string, importerPackRoot?: string, lock?: EffectLock,
  verified = new Set<string>(), deckDirectory?: string) {
  const match = /^slides:([a-z][a-z0-9-]*)\/([A-Za-z][A-Za-z0-9-]*)$/.exec(reference);
  if (!match) throw new Error(`Invalid effect pack reference "${reference}".`);
  const [, id, entry] = match;
  const locked = lock?.packs[id];
  const local = deckDirectory ? localEffectPack(id, deckDirectory, locked) : undefined;
  let pin: PackPin | undefined = local || isLocalPack(locked) ? undefined : locked;
  if (lock && !local && !pin) throw new MissingEffectPack(id, "has no pinned version in this deck");
  const importer = importerPackRoot && JSON.parse(fs.readFileSync(path.join(importerPackRoot, "pack.json"), "utf8"));
  const expected = importer && Object.hasOwn(importer.dependencies ?? {}, id) ? importer.dependencies[id] : undefined;
  if (importer && !expected && importer.id !== id) throw new Error(`Effect pack "${importer.id}" does not declare its dependency on "${id}".`);
  if (expected && !validVersion(expected)) throw new Error("Invalid effect dependency version.");
  const active = path.join(directory, id, "active.json");
  if (!local && !pin && fs.existsSync(active)) pin = JSON.parse(fs.readFileSync(active, "utf8"));
  if (pin) validatePin(pin);
  // A default dependency belongs to its importing pack's exact version, even
  // when the user has independently updated that dependency's default.
  if (!local && !lock && expected && pin?.version !== expected) {
    const versions = path.join(directory, id, expected);
    const hashes = fs.existsSync(versions) ? fs.readdirSync(versions).filter(validSha) : [];
    if (hashes.length === 1) pin = { version: expected, sha256: hashes[0] };
    else if (pin || hashes.length) throw new MissingEffectPack(id, `requires reinstalling version ${expected}`);
  }
  const selected = local ? path.resolve(deckDirectory!, local.path) : pin ? pinnedPackDirectory(directory, id, pin) : path.join(directory, id);
  const manifest = path.join(selected, "pack.json");
  if (!fs.existsSync(manifest)) throw new MissingEffectPack(id, pin ? `version ${pin.version} is not installed` : undefined);
  if (pin && !verified.has(selected)) {
    if (!verifyInstalledPack(selected, pin)) throw new MissingEffectPack(id);
    verified.add(selected);
  }
  const root = fs.realpathSync(path.dirname(manifest));
  const config = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const incompatibility = effectPackIncompatibility(config);
  if (config.id !== id || incompatibility || typeof config.version !== "string" || (pin && config.version !== pin.version)) {
    throw new Error(`Effect pack "${id}" has an incompatible manifest.${incompatibility ? ` ${incompatibility}` : ""}`);
  }
  if (importerPackRoot && importerPackRoot !== root) {
    if (expected !== config.version) throw new Error(`Effect pack "${importer.id}" requires "${id}" version ${expected}, but ${config.version} is installed.`);
  }
  const target = Object.hasOwn(config.exports ?? {}, entry) ? config.exports[entry] : undefined;
  if (typeof target !== "string" || !target.startsWith("./")) throw new Error(`Effect pack "${id}" does not export "${entry}".`);
  const file = fs.realpathSync(path.resolve(root, target));
  const relative = path.relative(root, file);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(file).isFile()) {
    throw new Error(`Effect pack "${id}" entry "${entry}" escapes its pack directory.`);
  }
  return { file, root, manifest, id, pin, local };
}
