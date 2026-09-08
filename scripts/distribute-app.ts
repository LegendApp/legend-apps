#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import path from "node:path";
import { appIds, assertSupportedPlatform, loadAppManifest, loadAppPackageMetadata, rootDir } from "./lib/apps";
import { createPrompts, PromptCancelled } from "./lib/prompts";
import { getMacOSReleaseBuild, getMacOSReleaseDistDir, getMacOSSparkleAppcastPath } from "./lib/release";

function runScript(script: string, args: string[]) {
  const result = spawnSync("bun", [path.join(rootDir, "scripts", script), ...args], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const [action, requestedApp, ...extraArgs] = process.argv.slice(2);
  if (action !== "package" && action !== "release") {
    throw new Error("Expected package or release.");
  }
  if (requestedApp === "--help" || requestedApp === "-h" || extraArgs.includes("--help")) {
    console.log(`Usage: bun ${action} [app]

Interactive macOS ${action === "package" ? "packaging" : "GitHub release"} wizard. Omit the app to choose it.
Package: confirm the configured version, choose CPUs, build/reuse, and signed/local output.
Release: choose CPUs, publish/verify, and optional release notes. Publishing asks for
confirmation after all release checks pass.

For automation and advanced flags, use the existing non-interactive commands:
  bun run package:macos <app> [arm|x86|all] [--skip-build] [--skip-sign] [--skip-notarize] [--skip-appcast]
  bun run githubrelease <app> [arm|x86|all] [--verify-only] [--notes-file <path>]`);
    return;
  }
  if (extraArgs.length) {
    throw new Error(`Unexpected arguments: ${extraArgs.join(" ")}. Use bun ${action} --help.`);
  }

  // Validate an explicit app before opening the terminal UI.
  let manifest = requestedApp ? await loadAppManifest(requestedApp) : undefined;
  const prompts = createPrompts();
  try {
    if (!manifest) {
      const manifests = await Promise.all(appIds.map((id) => loadAppManifest(id)));
      const choices = manifests.filter((app) => app.platforms.includes("macos") && app.release?.macos);
      if (!choices.length) throw new Error("No apps have macOS release metadata.");
      const appId = await prompts.select("Choose an app", choices.map((app) => ({
        value: app.id,
        label: `${app.displayName} (${app.id})`,
      })));
      manifest = choices.find((app) => app.id === appId)!;
    }
    assertSupportedPlatform(manifest, "macos");
    if (!manifest.release?.macos) throw new Error(`${manifest.id} must define macOS release metadata first.`);
    const appId = manifest.id;
    const appPackage = loadAppPackageMetadata(appId);
    console.log(`\n${manifest.displayName} — macOS — version ${appPackage.version}, build ${getMacOSReleaseBuild(manifest, appPackage)}`);

    if (action === "package") {
      console.log(`Version: apps/${appId}/package.json; build number: apps/${appId}/app.manifest.ts`);
      if (!await prompts.confirm("Is this the version/build you want to package?", true)) {
        console.log(`Update those files, then rerun bun package ${appId}.`);
        return;
      }
    }
    const arch = await prompts.select("Which Macs?", [
      { value: "all", label: "Apple Silicon and Intel (two archives)" },
      { value: "arm", label: "Apple Silicon only" },
      { value: "x86", label: "Intel only" },
    ] as const);

    if (action === "package") {
      const profile = await prompts.select("Package for", [
        { value: "distribution", label: "Distribution — sign, notarize, and generate Sparkle update feeds" },
        { value: "local", label: "Local testing — skip signing, notarization, and update feeds" },
      ] as const);
      const build = await prompts.select("Build", [
        { value: "fresh", label: "Build from current source" },
        { value: "reuse", label: "Reuse existing release builds (must match the version/build above)" },
      ] as const);
      const args: string[] = [appId, arch];
      if (build === "reuse") args.push("--skip-build");
      if (profile === "local") args.push("--skip-sign", "--skip-notarize", "--skip-appcast");
      console.log(`\nPackage ${appId} ${appPackage.version}: ${arch}, ${profile}, ${build === "fresh" ? "new build" : "existing builds"}.`);
      console.log(`Output: ${path.relative(rootDir, getMacOSReleaseDistDir(manifest))}`);
      if (!await prompts.confirm("Start packaging?", true)) {
        console.log("Cancelled.");
        return;
      }
      prompts.close();
      if (profile === "distribution") runScript("prep-app-changelog.ts", [appId]);
      runScript("package-macos-app.ts", args);
      if (profile === "distribution") {
        const architectures = arch === "all" ? ["arm", "x86"] as const : [arch];
        console.log("\nReview, commit, and push the release changes to main:");
        console.log(`  apps/${appId}/package.json (version), apps/${appId}/app.manifest.ts (build number)`);
        console.log(`  apps/${appId}/CHANGELOG.md`);
        for (const cpu of architectures) {
          console.log(`  ${path.relative(rootDir, getMacOSSparkleAppcastPath(manifest, cpu))}`);
        }
        console.log(`Then run: bun release ${appId} and choose the same Macs (${arch}).`);
      } else {
        console.log("\nLocal package complete. Choose Distribution when preparing a GitHub release.");
      }
    } else {
      const mode = await prompts.select("Release action", [
        { value: "publish", label: "Publish a GitHub release (confirm after verification)" },
        { value: "verify", label: "Verify release readiness without publishing" },
      ] as const);
      const notesFile = await prompts.ask("Release notes file (Enter to use the app changelog)");
      const args = [appId, arch, mode === "verify" ? "--verify-only" : "--confirm"];
      if (notesFile) args.push("--notes-file", notesFile);
      prompts.close();
      console.log("\nChecking packaged archives, changelog, and published main. Prepare packages with bun package " + appId + ".");
      runScript("github-release-app.ts", args);
    }
  } finally {
    prompts.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(error instanceof PromptCancelled ? 130 : 1);
});
