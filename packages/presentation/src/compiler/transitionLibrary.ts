import fs from "node:fs";
import path from "node:path";
import { builtinTransitionSources } from "../transitions";

export function transitionReference(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !("type" in value)) {
    const v = value as { name?: unknown; source?: unknown };
    if (typeof v.source === "string") return v.source;
    if (typeof v.name === "string") return v.name;
  }
  return undefined;
}

export function resolveTransitionFile(reference: string, deckRoot: string, library?: string) {
  const local = reference.startsWith("./");
  if (!local && !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(reference)) throw new Error(`Invalid transition reference "${reference}".`);
  const root = local ? deckRoot : library;
  let file: string | undefined;
  if (root) {
    const candidate = path.resolve(root, local ? reference : `${reference}.ts`);
    if (fs.existsSync(candidate)) {
      const realRoot = fs.realpathSync(root);
      const real = fs.realpathSync(candidate);
      const relative = path.relative(realRoot, real);
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Transition "${reference}" escapes its directory.`);
      if (!fs.statSync(real).isFile()) throw new Error(`Transition "${reference}" is not a file.`);
      file = real;
    }
  }
  if (!file && !(reference in builtinTransitionSources)) throw new Error(`Transition "${reference}" was not found in the deck or transition library.`);
  return file;
}
