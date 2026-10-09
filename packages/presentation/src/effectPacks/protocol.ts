import { validPackId, validVersion } from "./schema";
export type EffectAction = { type: "install"; pack: string; version: string } | { type: "example"; effect: string };
export function parseEffectAction(value: string): EffectAction {
  // Hermes' URL shim does not implement all URL/searchParams operations.
  const match = /^legend-slides:\/\/effects\/(install|example)\?([^#]*)$/.exec(value);
  if (!match) throw new Error("Invalid Slides effect link.");
  const parameters = new Map<string, string>();
  for (const part of match[2].split("&")) {
    const separator = part.indexOf("=");
    if (separator < 1) throw new Error("Invalid effect link parameter.");
    const key = decodeURIComponent(part.slice(0, separator)), value = decodeURIComponent(part.slice(separator + 1));
    if (parameters.has(key)) throw new Error("Duplicate effect link parameter.");
    parameters.set(key, value);
  }
  if (match[1] === "install") {
    const pack = parameters.get("pack") ?? "", version = parameters.get("version") ?? "";
    if (!validPackId(pack) || !validVersion(version)) throw new Error("Invalid effect pack or version.");
    return { type: "install", pack, version };
  }
  const effect = parameters.get("effect") ?? "";
  if (!validPackId(effect)) throw new Error("Invalid effect example.");
  return { type: "example", effect };
}
