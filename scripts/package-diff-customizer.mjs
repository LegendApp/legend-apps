import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDiffCustomizationBaseline } from "./diff-customization.mjs";
import { loadAppManifest, loadAppPackageMetadata } from "./lib/apps";
import { getMacOSReleaseBuild, getMacOSReleaseVersion } from "./lib/release";

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
// codesign treats every directory in Contents/Helpers as a bundle and rejects one without Info.plist.
const appPackage = loadAppPackageMetadata("diff");
const plist = {
  CFBundleIdentifier: `${(await loadAppManifest("diff")).bundleIds.macos}.customizer`,
  CFBundleName: "Diff Customizer",
  CFBundleExecutable: "bun",
  CFBundlePackageType: "BNDL",
  CFBundleShortVersionString: getMacOSReleaseVersion(appPackage),
  CFBundleVersion: getMacOSReleaseBuild(appPackage),
};
fs.writeFileSync(path.join(destination, "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${Object.entries(plist).map(([key, value]) => `<key>${key}</key><string>${value}</string>`).join("")}</dict></plist>
`);
