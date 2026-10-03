import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDiffCustomizationBaseline } from "./diff-customization.mjs";

const destination = process.argv[2];
if (!destination) throw new Error("Usage: bun scripts/package-diff-customizer.mjs <helper-directory> [arm64|x64]");
fs.mkdirSync(destination, { recursive: true });
const arch = process.argv[3] ?? process.arch;
if (!["arm64", "x64"].includes(arch)) throw new Error("Unsupported customizer architecture.");
const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("./diff-customization.mjs", import.meta.url))],
  target: "bun",
  compile: { target: `bun-darwin-${arch}`, outfile: path.join(destination, "bun") },
  define: { __DIFF_BASELINE__: JSON.stringify(readDiffCustomizationBaseline()) },
});
if (!result.success) throw new Error(result.logs.map(String).join("\n"));
fs.chmodSync(path.join(destination, "bun"), 0o755);
fs.writeFileSync(path.join(destination, ".spark-entry"), "bun");
