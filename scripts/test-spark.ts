import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = ["scripts/verify-spark-dependency.test.ts", "scripts/lib/sparkSdk.test.ts", "scripts/lib/sparkWorkspaces.test.ts",
  "scripts/lib/sparkInstall.test.ts", "scripts/lib/localSpark.test.ts", "scripts/lib/macosSmoke.test.ts", "scripts/lib/sparkDevServer.test.ts",
  "scripts/lib/sharedDebugHost.test.ts", "scripts/lib/slidesCompiler.test.ts", "shell/src/launchArguments.test.ts"];
let failures = 0;
for (const file of files) {
  const child = spawnSync(process.execPath, ["test", file], { cwd: root, stdio: "inherit" });
  if (child.error) throw child.error;
  if (child.status !== 0) failures++;
}
console.log(`${files.length - failures}/${files.length} Spark test files passed.`);
process.exitCode = failures ? 1 : 0;
