#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./lib/apps";

const scenario = process.env.MARKDOWN_E2E_SCENARIO ?? "far-down-structural-edits";
const seed = process.env.MARKDOWN_E2E_SEED ?? "12345";
const blockCount = process.env.MARKDOWN_E2E_BLOCK_COUNT ?? "2000";
const session = process.env.AGENT_DEVICE_SESSION ?? "markdown-e2e";
const artifactsDir = path.join(rootDir, ".artifacts", "markdown-e2e");
const stepsFile = path.join(rootDir, "e2e", "agent-device", "markdown-far-down.steps.json");
const skipBuild = process.env.MARKDOWN_E2E_SKIP_BUILD === "1";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      AGENT_DEVICE_PLATFORM: "macos",
      AGENT_DEVICE_SESSION: session,
      AGENT_DEVICE_SESSION_LOCK: "reject",
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

fs.mkdirSync(artifactsDir, { recursive: true });

const launchArgs = [
  "--",
  `--markdown-e2e=${scenario}`,
  `--markdown-e2e-seed=${seed}`,
  `--markdown-e2e-block-count=${blockCount}`,
];

run("bun", [
  "run",
  "markdown",
  skipBuild ? "open" : "run",
  "macos",
  ...launchArgs,
]);

run("agent-device", [
  "--session",
  session,
  "--platform",
  "macos",
  "--session-lock",
  "reject",
  "batch",
  "--steps-file",
  stepsFile,
  "--on-error",
  "stop",
]);
