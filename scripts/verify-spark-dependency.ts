#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const staged = process.argv.includes("--staged");
function read(file: string) {
  if (!staged) return fs.readFileSync(file, "utf8");
  const result = spawnSync("git", ["show", `:${file}`], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Cannot read staged ${file}: ${result.stderr.trim()}`);
  return result.stdout;
}
function committed(file: string) {
  const result = spawnSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : undefined;
}
function sparkLockEntries(source: string) {
  return [...source.matchAll(/"@legendapp\/spark"\s*:\s*(?:\[\s*)?("(?:[^"\\]|\\.)*")/g)]
    .map(match => match[1]).sort().join("\n");
}
const registryVersion = /^(?:[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?|latest|next)$/;
try {
  const manifest = JSON.parse(read("package.json"));
  const previousSource = staged ? committed("package.json") : undefined;
  const previous = previousSource ? JSON.parse(previousSource) : undefined;
  const version = manifest.catalog?.["@legendapp/spark"];
  if ((!staged || !previousSource || version !== previous?.catalog?.["@legendapp/spark"]) &&
      (typeof version !== "string" || !registryVersion.test(version))) throw new Error("Do not stage local Spark catalog pins; select an npm version or leave the override unstaged.");
  for (const section of ["dependencies", "devDependencies", "overrides"]) {
    const dependency = manifest[section]?.["@legendapp/spark"];
    if (staged && previousSource && dependency === previous?.[section]?.["@legendapp/spark"]) continue;
    if (dependency !== undefined && dependency !== "catalog:" && !registryVersion.test(dependency)) throw new Error(`Local Spark ${section} overrides must remain uncommitted.`);
  }
  const lock = read("bun.lock");
  const previousLock = staged ? committed("bun.lock") : undefined;
  if (!staged || previousLock === undefined || sparkLockEntries(lock) !== sparkLockEntries(previousLock)) {
    const resolutions = [...lock.matchAll(/"@legendapp\/spark"\s*:\s*\[\s*("(?:[^"\\]|\\.)*")/g)];
    if (!resolutions.length) throw new Error("bun.lock is missing the npm Spark resolution.");
    for (const [, resolution] of resolutions) {
      const value = JSON.parse(resolution) as string;
      if (!value.startsWith("@legendapp/spark@") || !registryVersion.test(value.slice("@legendapp/spark@".length))) throw new Error("Local Spark resolutions in bun.lock must remain uncommitted.");
    }
    if (/"@legendapp\/spark"\s*:\s*"(?:file:|link:|workspace:|\/|\.\/|\.\.\/)/.test(lock)) throw new Error("Local Spark pins in bun.lock must remain uncommitted.");
  }
  console.log(staged ? "Verified staged Spark dependency changes." : "Verified npm Spark dependency.");
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
