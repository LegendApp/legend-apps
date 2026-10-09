import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

// Bun caches module mocks across files. Each suite has its own native/clock
// harness, so run in separate processes to make results independent of ordering.
const root = path.resolve(import.meta.dirname, "..");
const directories = ["packages/presentation/src/__tests__", "apps/slides/src/__tests__", "packages/slides-effects/tests"];
const files = directories.flatMap(directory => readdirSync(path.join(root, directory))
  .filter(file => /\.test\.[cm]?[jt]sx?$/.test(file)).map(file => path.join(directory, file))).sort();
let failures = 0;
for (const file of files) {
  const child = spawnSync(process.execPath, ["test", "--timeout", "30000", "--preload", path.join(root, "apps/slides/src/__tests__/nativeMock.ts"), file], {
    cwd: root, stdio: "inherit",
  });
  if (child.error) throw child.error;
  if (child.status !== 0) failures++;
}
console.log(`${files.length - failures}/${files.length} Slides test files passed.`);
process.exitCode = failures ? 1 : 0;
