import { createRequire } from "node:module";
import path from "node:path";

/** Runtime deck styles replace Uniwind's global stylesheet. Preserve the host's
 * candidates even when the installed compiler has no application source tree. */
export function collectSlidesHostClasses(root: string, dependencyRoot = root): string {
  const shellRequire = createRequire(path.join(dependencyRoot, "shell/package.json"));
  const uniwindRequire = createRequire(shellRequire.resolve("uniwind/package.json"));
  const { Scanner } = uniwindRequire("@tailwindcss/oxide");
  const scanner = new Scanner({ sources: ["apps", "packages", "shell/src"].map(folder => ({
    base: path.join(root, folder), pattern: "**/*", negated: false,
  })) });
  return scanner.scan().sort().join("\n") + "\n";
}
