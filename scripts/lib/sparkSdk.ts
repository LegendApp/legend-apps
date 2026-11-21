import fs from "node:fs";
import path from "node:path";
import { rootDir, shellDir } from "./apps";
import { acquireInstallLock } from "./sparkInstall";

export const sharedSparkWorkspace = path.join(shellDir, ".legend", "spark");
const previousInstallFiles = ["node_modules", "bun.lock"];

// The former shared install shadows the repository SDK for generated projects.
if (previousInstallFiles.some(name => fs.existsSync(path.join(sharedSparkWorkspace, name)))) {
  const unlock = acquireInstallLock(sharedSparkWorkspace);
  try { preservePreviousSparkInstall(sharedSparkWorkspace); }
  finally { unlock(); }
}

export const sparkSdkRoot = fs.realpathSync(path.join(rootDir, "node_modules/@legendapp/spark"));
const metadata = JSON.parse(fs.readFileSync(path.join(sparkSdkRoot, "package.json"), "utf8"));
export const sparkSdkPackages = (metadata.spark.bundledModules as string[]).map(name => {
  const root = path.join(sparkSdkRoot, metadata.spark.bundledModuleRoot, "node_modules", name);
  const json = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const native = !!(json.codegenConfig || json.spark?.nativeModules ||
    fs.readdirSync(root).some(file => file.endsWith(".podspec")) || fs.existsSync(path.join(root, "expo-module.config.json")));
  return { name, root, native };
});

export function preservePreviousSparkInstall(project: string) {
  for (const name of previousInstallFiles) {
    const previous = path.join(project, name);
    if (!fs.existsSync(previous)) continue;
    if (name === "node_modules" && fs.readdirSync(previous).every(entry => entry === ".cache")) {
      fs.rmSync(previous, { recursive: true });
      continue;
    }
    const backup = path.join(path.dirname(project), ".legacy-installs", path.basename(project), name);
    if (fs.existsSync(backup)) throw new Error(`Cannot preserve old Spark install: ${backup} already exists. Move ${previous} before preparing this app.`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.renameSync(previous, backup);
    if (name === "node_modules") {
      fs.rmSync(path.join(project, ".spark/native-selection.json"), { force: true });
      for (const host of fs.readdirSync(project, { withFileTypes: true })) {
        if (host.isDirectory()) fs.rmSync(path.join(project, host.name, ".spark/DerivedData"), { recursive: true, force: true });
      }
    }
  }
}
