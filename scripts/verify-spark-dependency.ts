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
const registryVersion = /^(?:[~^]?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?|latest|next)$/;
try {
  const manifest = JSON.parse(read("package.json"));
  const version = manifest.catalog?.["@legendapp/spark"];
  if (typeof version !== "string" || !registryVersion.test(version)) throw new Error("The committed Spark catalog must select a published npm version.");
  for (const section of ["dependencies", "devDependencies", "overrides"]) {
    const dependency = manifest[section]?.["@legendapp/spark"];
    if (dependency !== undefined && dependency !== "catalog:" && !registryVersion.test(dependency)) throw new Error(`Local Spark ${section} overrides must remain uncommitted.`);
  }
  const lock = read("bun.lock");
  const resolutions = [...lock.matchAll(/"@legendapp\/spark"\s*:\s*\[\s*("(?:[^"\\]|\\.)*")/g)];
  if (!resolutions.length) throw new Error("bun.lock is missing the published Spark resolution.");
  for (const [, resolution] of resolutions) {
    const value = JSON.parse(resolution) as string;
    if (!value.startsWith("@legendapp/spark@") || !registryVersion.test(value.slice("@legendapp/spark@".length))) throw new Error("Local Spark resolutions in bun.lock must remain uncommitted.");
  }
  if (/"@legendapp\/spark"\s*:\s*"(?:file:|link:|workspace:|\/|\.\/|\.\.\/)/.test(lock)) throw new Error("Local Spark pins in bun.lock must remain uncommitted.");
  console.log("Verified published Spark dependency.");
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
