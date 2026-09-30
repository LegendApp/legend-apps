import { syncTransitionLibrary } from "./transitionLibraryPolicy";
import { builtinTransitionSources } from "@legend-apps/presentation";
import { createStorage } from "@legend-apps/storage";


export const transitionStorage = createStorage({ subfolder: "slides" });
export function getTransitionDirectory() {
  return syncTransitionLibrary(transitionStorage);
}
export function transitionDirectoryPath() {
  return decodeURIComponent(getTransitionDirectory().uri.replace(/^file:\/\//, ""));
}
export function listTransitions() {
  getTransitionDirectory();
  return transitionStorage.list("transitions", { extension: ".ts" }).map((file) => file.name.replace(/\.ts$/, "")).sort();
}
export function duplicateTransition(name: string) {
  const source = transitionStorage.read(`transitions/${name}.ts`, { format: "text" });
  if (source === undefined) throw new Error(`Transition "${name}" is missing.`);
  let copy = `${name}-copy`;
  let suffix = 2;
  while (transitionStorage.read(`transitions/${copy}.ts`, { format: "text" }) !== undefined) copy = `${name}-copy-${suffix++}`;
  transitionStorage.write(`transitions/${copy}.ts`, source, { format: "text" });
  return copy;
}
export function restoreTransition(name: string) {
  const source = builtinTransitionSources[name];
  if (!source) throw new Error("Only built-in transitions can be restored.");
  // Keep the previous version recoverable, including on repeated restores.
  duplicateTransition(name);
  transitionStorage.write(`transitions/${name}.ts`, source, { format: "text" });
}
