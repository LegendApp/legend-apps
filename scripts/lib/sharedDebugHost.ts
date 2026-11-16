import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadAppManifest, rootDir } from "./apps";
import { acquireInstallLock } from "./sparkInstall";
import { sparkSdkRoot } from "./sparkSdk";
import { prepareSparkWorkspace, sparkConfig, sparkWorkspace } from "./sparkWorkspaces";
import { runCommand } from "./run";
import type { AppManifest } from "./types";

const require = createRequire(import.meta.url);
const { toExpo } = require("@legendapp/spark/config");
const { identity } = require(path.join(sparkSdkRoot, "vendor/node_modules/@legendapp/spark-desktop-config/identity.cjs"));
const sdk = await import(pathToFileURL(path.join(sparkSdkRoot, "vendor/node_modules/@legendapp/spark-cli/dist/project.js")).href);
export const sharedDebugWorkspace = sparkWorkspace("debug-host");
export const sharedDebugAppWorkspace = (appId: string) => sparkWorkspace(`${appId}-shared-debug`);
const receiptFile = path.join(sharedDebugWorkspace, ".spark/shared-host.json");

type SharedHost = { app: string; framework: string; hash: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file: string, value: unknown) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** The root native inputs alone determine whether the shared binary is current. */
export function rootNativeSignature() {
  const modules = sdk.nativePackages(rootDir).map((pkg: { name: string; signature: string }) => [pkg.name, pkg.signature]);
  const pins = sdk.installedPackages(rootDir).filter((pkg: { name: string }) =>
    ["react", "react-native", "react-native-macos", "expo"].includes(pkg.name))
    .map((pkg: { name: string; json: { version: string } }) => [pkg.name, pkg.json.version]);
  return hash([sdk.VERSION, process.env.SPARK_MACOS_ARCH ?? process.arch, modules, pins, sdk.hostSourceSignature(rootDir), sdk.localSigningIdentity(sharedDebugWorkspace, "dev")]);
}

export function findSharedDebugHost(): SharedHost | undefined {
  if (!fs.existsSync(receiptFile)) return;
  const host = read(receiptFile) as SharedHost;
  if (fs.existsSync(host.app) && host.hash === rootNativeSignature()) return host;
}

export async function buildSharedDebugHost(cli: string, env: Record<string, string | undefined>, offline: boolean, args: string[] = []) {
  fs.mkdirSync(sharedDebugWorkspace, { recursive: true });
  const unlock = acquireInstallLock(sharedDebugWorkspace, 3_600_000);
  try {
    const cached = findSharedDebugHost();
    if (cached && !args.includes("--force")) { console.log(`Reusing shared Debug host ${cached.hash.slice(0, 12)}.`); return cached; }
    const base = await loadAppManifest("hello-world");
    prepareSparkWorkspace({ ...base, displayName: "Legend Debug Host",
      bundleIds: { ...base.bundleIds, macos: "so.legend.debughost" } }, "dev", sharedDebugWorkspace);
    const configFile = path.join(sharedDebugWorkspace, "desktop.config.json");
    const config = read(configFile);
    // All root modules are linked, independently of the app being launched.
    config.expo.plugins = [path.join(rootDir, "packages/diff-parser/app.plugin.cjs")];
    write(configFile, config);
    const buildArgs = ["build", "--dev", ...args];
    if (offline) {
      const { assertSparkOfflineBuild } = await import("./sparkInstall");
      await assertSparkOfflineBuild(sharedDebugWorkspace, cli, buildArgs);
    }
    fs.rmSync(receiptFile, { force: true });
    runCommand("node", [cli, ...buildArgs], { cwd: sharedDebugWorkspace, env });
    const built = read(path.join(sharedDebugWorkspace, ".spark/dev-build.json"));
    const host: SharedHost = { app: built.app, framework: sdk.VERSION, hash: rootNativeSignature() };
    write(receiptFile, host);
    return host;
  } finally { unlock(); }
}

/** Use the same plist translation as a separate build, including lifecycle plugins and Music glass. */
export function debugLaunchProfile(manifest: AppManifest) {
  const config = sparkConfig(manifest);
  const expo = toExpo(config).expo;
  return {
    entry: path.join(sharedDebugAppWorkspace(manifest.id), "index.ts"),
    infoPlist: { ...expo.macos.infoPlist, ...identity(expo),
      CFBundleIdentifier: manifest.bundleIds.macos, CFBundleName: manifest.displayName,
      CFBundleDisplayName: manifest.displayName, CFBundleShortVersionString: config.version,
      CFBundleVersion: config.macos.buildNumber },
  };
}

export function materializeDebugApp(manifest: AppManifest, host: SharedHost) {
  const project = sharedDebugAppWorkspace(manifest.id);
  const unlock = acquireInstallLock(project);
  try {
    const profile = debugLaunchProfile(manifest);
    const key = hash([host.hash, profile]);
    const receipt = path.join(project, ".spark/shared-debug.json");
    const app = path.join(project, ".spark/shared-debug", `${manifest.displayName}.app`);
    if (fs.existsSync(receipt) && read(receipt).hash === key && fs.existsSync(app)) return app;
    const temporary = `${app}.${randomUUID()}.app`;
    fs.mkdirSync(path.dirname(app), { recursive: true });
    try {
      // APFS clones share native code/resources without another compile or a full disk copy.
      execFileSync("/bin/cp", ["-cR", host.app, temporary]);
      const plist = path.join(temporary, "Contents/Info.plist");
      const info = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", plist], { encoding: "utf8" }));
      // Remove associations and app-specific metadata inherited from the shared host.
      for (const name of Object.keys(info)) if (name.startsWith("Legend") || name.startsWith("Spark") || name.startsWith("NS") && name.endsWith("UsageDescription")
        || ["CFBundleURLTypes", "CFBundleDocumentTypes"].includes(name)) delete info[name];
      Object.assign(info, profile.infoPlist);
      info.SparkFrameworkVersion = host.framework;
      fs.writeFileSync(plist, JSON.stringify(info));
      execFileSync("plutil", ["-convert", "xml1", plist]);
      execFileSync("codesign", ["--force", "--sign", "-", temporary], { stdio: "pipe" });
      fs.rmSync(app, { recursive: true, force: true });
      fs.renameSync(temporary, app);
      write(receipt, { app, hash: key, hostHash: host.hash, profile });
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
    return app;
  } finally { unlock(); }
}
