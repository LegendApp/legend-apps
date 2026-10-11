import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { rootDir } from "./apps";

const ignoredDirectories = new Set(["node_modules", ".git"]);

function fileList(directory: string, prefix = ""): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignoredDirectories.has(entry.name)) return [];
    const relative = path.join(prefix, entry.name);
    if (!entry.isDirectory()) return [relative];
    return fileList(path.join(directory, entry.name), relative);
  });
}

function localDependencies(pkg: Record<string, Record<string, string>>) {
  return [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies, pkg.peerDependencies, pkg.overrides]
    .flatMap(section => Object.values(section ?? {}))
    .filter(value => value.startsWith("file:")).map(value => value.slice(5));
}

export function sparkInstallHash(project: string, appId: string, repoRoot = rootDir) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(process.versions.bun));
  const files = new Set([path.join(project, "package.json"), path.join(repoRoot, "bun.lock")]);
  const pkg = JSON.parse(fs.readFileSync(path.join(project, "package.json"), "utf8"));
  const sdk = pkg.dependencies["@legendapp/spark"] as string;
  if (sdk.startsWith("file:")) {
    const manifest = path.join(path.dirname(path.resolve(project, sdk.slice(5))), "manifest.json");
    if (fs.existsSync(manifest)) {
      files.add(manifest);
      for (const archive of Object.values(JSON.parse(fs.readFileSync(manifest, "utf8"))) as string[]) {
        files.add(path.resolve(path.dirname(manifest), archive));
      }
    }
  }
  for (const patch of Object.values(pkg.patchedDependencies ?? {}) as string[]) files.add(path.resolve(project, patch));
  // file: links snapshot filenames. Source edits need no install, but added or
  // removed files (including the app sources exposed by Metro) need new links.
  const local = new Set([path.join(repoRoot, "apps", appId), ...localDependencies(pkg).map(file => path.resolve(project, file))]);
  for (const location of local) {
    if (!fs.statSync(location).isDirectory()) {
      files.add(location);
      continue;
    }
    hash.update(JSON.stringify([path.relative(repoRoot, location), fileList(location).sort()]));
    const manifest = path.join(location, "package.json");
    files.add(manifest);
    for (const dependency of localDependencies(JSON.parse(fs.readFileSync(manifest, "utf8")))) {
      local.add(path.resolve(location, dependency));
    }
  }
  for (const file of [...files].sort()) {
    hash.update(JSON.stringify(path.relative(repoRoot, file)));
    hash.update(createHash("sha256").update(fs.readFileSync(file)).digest());
  }
  return hash.digest("hex");
}

export function parseSparkInstallArgs(args: string[], env: Record<string, string | undefined> = process.env) {
  const separator = args.indexOf("--");
  const runnerArgs = separator < 0 ? args : args.slice(0, separator);
  return {
    offline: env.LEGEND_OFFLINE === "1" || runnerArgs.includes("--offline"),
    force: runnerArgs.includes("--reinstall"),
    extra: [...runnerArgs.filter(arg => arg !== "--offline" && arg !== "--reinstall"), ...(separator < 0 ? [] : args.slice(separator))],
  };
}

type InstallOptions = {
  project: string;
  appId: string;
  repoRoot?: string;
  offline?: boolean;
  force?: boolean;
  env?: Record<string, string | undefined>;
};

export class SparkInstallError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
  }
}

function runInstall(args: string[], options: InstallOptions) {
  const result = spawnSync("bun", args, { cwd: options.project, env: { ...process.env, ...options.env }, stdio: "inherit" });
  if (result.error) throw new SparkInstallError(`Could not run Bun install for ${options.appId}: ${result.error.message}`);
  if (result.status !== 0) throw new SparkInstallError(`Bun install failed for ${options.appId} (${result.signal ?? result.status}).`, result.status ?? 1);
}

function acquireInstallLock(project: string) {
  const lock = path.join(project, ".legend-install.lock");
  const owner = `${process.pid}-${randomUUID()}`;
  const candidate = `${lock}.${owner}`;
  const started = Date.now();
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  // Publish a populated directory atomically. A replacement always contains
  // its own unique owner file, so another recoverer's rmdir cannot remove it.
  fs.mkdirSync(candidate);
  try {
    fs.writeFileSync(path.join(candidate, owner), "");
    for (;;) {
      try {
        fs.renameSync(candidate, lock);
        return () => {
          fs.unlinkSync(path.join(lock, owner));
          try { fs.rmdirSync(lock); }
          catch (error) {
            if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code!)) throw error;
          }
        };
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code!)) throw error;
      }
      try {
        const [observed] = fs.readdirSync(lock);
        let stale = !observed;
        if (observed) {
          const pid = Number(observed.split("-")[0]);
          if (!Number.isInteger(pid) || pid <= 0) throw new SparkInstallError(`Invalid install lock owner: ${lock}/${observed}`);
          try { process.kill(pid, 0); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
            stale = true;
          }
        }
        if (stale) {
          if (observed) fs.unlinkSync(path.join(lock, observed));
          fs.rmdirSync(lock);
          continue;
        }
      } catch (error) {
        if (["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code!)) continue;
        throw error;
      }
      if (Date.now() - started >= 60_000) throw new SparkInstallError(`Timed out waiting for ${lock}. Another process may be installing this workspace.`);
      Atomics.wait(sleeper, 0, 0, 50);
    }
  } finally {
    fs.rmSync(candidate, { recursive: true, force: true });
  }
}

export function installSparkWorkspace(options: InstallOptions, execute = runInstall): "skipped" | "installed" {
  const release = acquireInstallLock(options.project);
  try {
    return installUnlocked(options, execute);
  } finally {
    release();
  }
}

function installUnlocked(options: InstallOptions, execute: typeof runInstall): "skipped" | "installed" {
  const { project, appId } = options;
  const hash = sparkInstallHash(project, appId, options.repoRoot);
  const nodeModules = path.join(project, "node_modules");
  const stamp = path.join(nodeModules, ".legend-install-stamp");
  if (!options.force && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === hash) {
    console.log(`${appId}: dependencies unchanged; skipping Bun install.`);
    return "skipped";
  }
  if (options.offline) {
    const retry = options.force ? `spark ${appId} install --reinstall` : "spark:warm";
    throw new SparkInstallError(`${appId}: ${options.force ? "cannot reinstall offline" : "dependencies changed or install stamp missing"}; Bun has no offline install. Reconnect and run LEGEND_OFFLINE=0 bun run ${retry} (without --offline).`);
  }
  // A failed install must not leave a previously valid stamp behind.
  fs.rmSync(stamp, { force: true });
  try {
    execute(["install", "--linker", "hoisted"], options);
    fs.mkdirSync(nodeModules, { recursive: true });
    fs.writeFileSync(stamp, `${hash}\n`);
  } catch (error) {
    fs.rmSync(stamp, { force: true });
    throw error;
  }
  return "installed";
}

export const sparkOfflineHelp = "Offline builds require installed Bun dependencies and current native preparation. Spark SDK interactive supervisor keys (b/g/d) are outside this offline guard; use this script's run/build commands offline.";

export function assertSparkOfflineArgs(args: string[]) {
  if (args.some(arg => arg === "--project" || arg.startsWith("--project="))) {
    throw new SparkInstallError("Offline mode does not support --project redirects; use the named app's prepared workspace.");
  }
}

export async function assertSparkOfflineStart(project: string, cli: string, args: string[]) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    // Spark consumes the next token for these options, even if it looks like
    // a startup flag. An app argument must not bypass the offline guard.
    if (arg === "--app-arg" || arg === "--platform") { i++; continue; }
    if (["--no-open", "--help", "-h", "--runner-binary"].includes(arg) || arg.startsWith("--runner-binary=")) return;
  }
  const settingsFile = path.join(project, ".spark/settings.json");
  const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, "utf8")) : {};
  if (settings.target === "dev") return;
  const dist = path.resolve(path.dirname(cli), "../vendor/node_modules/@legendapp/spark-cli/dist");
  const sdk = await import(pathToFileURL(path.join(dist, "project.js")).href);
  const { findGo } = await import(pathToFileURL(path.join(dist, "local.js")).href);
  sdk.prepareConfig(project);
  const native = sdk.nativePackages(project);
  const runner = findGo(native, settings.goApp ? path.resolve(project, settings.goApp) : undefined, "macos");
  if (!runner || sdk.incompatible(runner.runtime, native, "macos").length) {
    throw new SparkInstallError("Spark Go startup may download a Runner and is disabled offline without a compatible local Runner. Use start, --no-open, --runner-binary <local path>, or select the dev target online first.");
  }
}

export async function assertSparkOfflineBuild(project: string, cli: string, args: string[]) {
  // Use the installed SDK's fingerprints and framework checks. Keep the branch
  // order aligned with spark-cli/dist/build.js, including cached-app reuse.
  const dist = path.resolve(path.dirname(cli), "../vendor/node_modules/@legendapp/spark-cli/dist");
  const { cliArguments } = await import(pathToFileURL(path.join(dist, "cli-arguments.js")).href);
  const { values } = cliArguments(args);
  if (values.help) {
    console.log(sparkOfflineHelp);
    return;
  }
  const { buildMode } = await import(pathToFileURL(path.join(dist, "build-mode.js")).href);
  const mode = buildMode(values);
  const force = !!values.force;
  if (values.platform) process.env.SPARK_PLATFORM = values.platform;
  const sdk = await import(pathToFileURL(path.join(dist, "project.js")).href);
  const native = await import(pathToFileURL(path.join(dist, "native-preparation.js")).href);
  sdk.prepareConfig(project);
  const all = sdk.nativePackages(project);
  let chosen = { included: all };
  if (mode === "release") {
    const { analyze } = await import(pathToFileURL(path.join(dist, "build.js")).href);
    chosen = await analyze(project, all);
  }
  const inputs = sdk.nativePreparationInputs(project, chosen.included);
  const fingerprint = sdk.digest(JSON.stringify(inputs));
  const projectFingerprint = sdk.nativeProjectFingerprint(inputs, chosen.included);
  const runtime = sdk.runtimeFor(project, chosen.included, mode);
  if (mode === "release") runtime.fingerprint = sdk.digest(runtime.fingerprint + sdk.hashFiles(project, [path.relative(project, sdk.stateFile(project, "analysis/app.js"))]));
  const resultFile = sdk.stateFile(project, `${mode}-build.json`);
  const existing = fs.existsSync(resultFile) ? sdk.readJson(resultFile) : undefined;
  if (!force && existing?.runtime.fingerprint === runtime.fingerprint && existing?.preparation?.fingerprint === fingerprint && fs.existsSync(existing.app)) return;
  const preparedFile = sdk.stateFile(project, "native-preparation.json");
  const prepared = fs.existsSync(preparedFile) ? sdk.readJson(preparedFile) : undefined;
  const nativeRoot = path.join(project, "macos");
  const hasProject = fs.existsSync(nativeRoot) && fs.readdirSync(nativeRoot).some(name => name.endsWith(".xcodeproj") && fs.existsSync(path.join(nativeRoot, name, "project.pbxproj")));
  const needsProject = force || !hasProject || prepared?.projectFingerprint !== projectFingerprint;
  const needsPods = needsProject || prepared?.fingerprint !== fingerprint || !fs.existsSync(path.join(nativeRoot, "Pods/Manifest.lock"));
  const missing = native.missingNativeFrameworks(project) as string[];
  if (needsPods || missing.length) {
    const reason = needsProject ? "native project needs generation" : prepared?.fingerprint !== fingerprint ? "native preparation is missing or out of date" : missing.length ? `native frameworks missing: ${missing.join(", ")}` : "Pods/Manifest.lock missing";
    throw new SparkInstallError(`Spark build needs ${needsProject ? "template prebuild and " : ""}pod install (${reason}), which may require the network. Reconnect and rerun this command without --offline and with LEGEND_OFFLINE=0. ${sparkOfflineHelp}`);
  }
}
