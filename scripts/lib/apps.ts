import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppManifest, Platform } from "./types";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const shellDir = path.join(rootDir, "shell");
export const appsDir = path.join(rootDir, "apps");
export const packagesDir = path.join(rootDir, "packages");

export const appIds = ["music", "markdown", "test-kitchen-sink"] as const;
export const platforms = ["macos", "ios", "android"] as const;
const commandModes = ["run", "dev", "start", "build", "prebuild", "verify"] as const;

type CommandMode = (typeof commandModes)[number] | "dev-check";

export function isPlatform(value: string): value is Platform {
  return platforms.includes(value as Platform);
}

export async function loadAppManifest(appId: string): Promise<AppManifest> {
  if (!appIds.includes(appId as (typeof appIds)[number])) {
    throw new Error(`Unknown app "${appId}". Expected one of: ${appIds.join(", ")}`);
  }

  const manifestPath = path.join(appsDir, appId, "app.manifest.ts");
  const mod = await import(manifestPath);
  return mod.default as AppManifest;
}

export function assertSupportedPlatform(manifest: AppManifest, platform: Platform) {
  if (!manifest.platforms.includes(platform)) {
    throw new Error(
      `App "${manifest.id}" does not support ${platform}. Supported: ${manifest.platforms.join(", ")}`,
    );
  }
}

export function parseAppCommand(argv: string[]) {
  const [appOrFlag, ...rest] = argv;

  if (!appOrFlag) {
    throw new Error("Missing app id. Usage: bun run music macos");
  }

  if (appOrFlag === "--all") {
    const mode = rest.includes("--dev-check") ? "dev-check" : "run";
    return { all: true as const, mode: mode as CommandMode, appId: null, platform: null, extraArgs: [] };
  }

  let mode: CommandMode = "run";
  let platformArg = rest[0];
  let consumedArgs = 1;

  if (commandModes.includes(platformArg as (typeof commandModes)[number])) {
    mode = platformArg === "dev" ? "run" : platformArg as CommandMode;
    platformArg = rest[1];
    consumedArgs = 2;
  }

  if (!platformArg || !isPlatform(platformArg)) {
    throw new Error(`Missing or invalid platform. Expected one of: ${platforms.join(", ")}`);
  }

  return {
    all: false as const,
    appId: appOrFlag,
    mode,
    platform: platformArg,
    extraArgs: rest.slice(consumedArgs),
  };
}
