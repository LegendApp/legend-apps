import { builtinTransitionSources } from "../../../packages/presentation/src/transitions";
import type { Storage } from "@legend-apps/storage";

export function syncTransitionLibrary(storage: Storage) {
  const directory = storage.ensureDirectory("transitions");
  const previous = storage.read<Record<string, string>>("transitions/.installed.json", { format: "json" }) ?? {};
  for (const [name, source] of Object.entries(builtinTransitionSources)) {
    const file = `transitions/${name}.ts`;
    const current = storage.read(file, { format: "text" });
    if (current === undefined || (current === previous[name] && current !== source)) storage.write(file, source, { format: "text" });
  }
  if (JSON.stringify(previous) !== JSON.stringify(builtinTransitionSources)) storage.write("transitions/.installed.json", builtinTransitionSources, { format: "json" });
  return directory;
}
