const path = require("node:path");
const sdk = path.dirname(require.resolve("@legendapp/spark/package.json"));
require(path.join(sdk, "vendor/node_modules/@legendapp/spark-desktop-config/native-patches.cjs")).prepareNativePatches(path.resolve(__dirname, ".."));
if (process.env.WT_DEPS_LOCKFILE_SHA256) {
  const result = require("node:child_process").spawnSync("bun", [path.join(__dirname, "lib/sparkInstall.ts")], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
