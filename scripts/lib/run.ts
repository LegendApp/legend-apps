import { spawnSync } from "node:child_process";
import { shellDir } from "./apps";
import type { Platform } from "./types";

export function runCommand(command: string, args: string[], options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
} = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function runPlatformCommand(
  appId: string,
  platform: Platform,
  mode: "dev" | "release",
  extraArgs: string[] = [],
) {
  const env = {
    LEGEND_APP: appId,
    LEGEND_PLATFORM: platform,
  };

  if (platform === "ios") {
    runCommand(
      "bun",
      mode === "release"
        ? ["x", "expo", "run:ios", "--configuration", "Release"]
        : ["x", "expo", "run:ios", ...extraArgs],
      { cwd: shellDir, env },
    );
  } else if (platform === "android") {
    runCommand(
      "bun",
      mode === "release"
        ? ["x", "expo", "run:android", "--variant", "release"]
        : ["x", "expo", "run:android", ...extraArgs],
      { cwd: shellDir, env },
    );
  } else {
    runCommand(
      "bun",
      mode === "release"
        ? ["x", "react-native", "build-macos", "--mode", "Release", "--scheme", "legendapp-shell-macos"]
        : ["x", "react-native", "run-macos", "--scheme", "legendapp-shell-macos", ...extraArgs],
      { cwd: shellDir, env },
    );
  }
}
