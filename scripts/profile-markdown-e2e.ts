#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./lib/apps";

type AgentDeviceStep = {
  command?: string;
  input?: unknown;
};

function printUsage() {
  console.info([
    "Usage: bun run profile:markdown-e2e",
    "",
    "Environment:",
    "  MARKDOWN_PROFILE_SCENARIO       Scenario to profile; defaults to editor-navigation-smoke.",
    "  MARKDOWN_E2E_BLOCK_COUNT        Block count passed to Markdown E2E; defaults to 5000.",
    "  MARKDOWN_PROFILE_SKIP_BUILD=1   Reuse the existing dev build instead of rebuilding.",
    "  AGENT_DEVICE_SESSION            Agent-device session name; defaults to markdown-perf.",
    "",
    "Artifacts are written under .artifacts/markdown-e2e/profiles/.",
  ].join("\n"));
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  printUsage();
  process.exit(0);
}

const scenario = process.env.MARKDOWN_PROFILE_SCENARIO ?? process.env.MARKDOWN_E2E_SCENARIO ?? "editor-navigation-smoke";
const seed = process.env.MARKDOWN_E2E_SEED ?? "12345";
const blockCount = process.env.MARKDOWN_E2E_BLOCK_COUNT ?? "5000";
const session = process.env.AGENT_DEVICE_SESSION ?? "markdown-perf";
const artifactsDir = path.join(rootDir, ".artifacts", "markdown-e2e");
const profileDir = path.join(artifactsDir, "profiles", `${scenario}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
const stepsFileByScenario: Record<string, string> = {
  "editor-code-block-smoke": "markdown-editor-code-block-smoke.steps.json",
  "editor-edit-navigation-smoke": "markdown-editor-edit-navigation-smoke.steps.json",
  "editor-navigation-smoke": "markdown-editor-navigation-smoke.steps.json",
  "editor-selection-smoke": "markdown-editor-selection-smoke.steps.json",
  "editor-soft-wrap-selection": "markdown-editor-soft-wrap-selection.steps.json",
  "editor-theme-reflow-smoke": "markdown-editor-theme-reflow-smoke.steps.json",
  "editor-ui-smoke": "markdown-editor-ui-smoke.steps.json",
  "far-down-structural-edits": "markdown-far-down.steps.json",
  "hydrate-while-editing": "markdown-far-down.steps.json",
};
const stepsFileName = stepsFileByScenario[scenario] ?? "markdown-editor-navigation-smoke.steps.json";
const stepsFile = path.join(rootDir, "e2e", "agent-device", stepsFileName);
const profileStepsFile = path.join(profileDir, `${scenario}.steps.json`);
const tracePath = path.join(profileDir, "cpu.trace");
const cpuReportPath = path.join(profileDir, "cpu-report.json");
const skipBuild = process.env.MARKDOWN_E2E_SKIP_BUILD === "1" || process.env.MARKDOWN_PROFILE_SKIP_BUILD === "1";

function run(command: string, args: string[], options: { allowFailure?: boolean; capturePath?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      AGENT_DEVICE_PLATFORM: "macos",
      AGENT_DEVICE_SESSION: session,
      AGENT_DEVICE_SESSION_LOCK: "reject",
    },
    encoding: options.capturePath ? "utf8" : undefined,
    stdio: options.capturePath ? ["ignore", "pipe", "inherit"] : "inherit",
  });

  if (options.capturePath) {
    fs.writeFileSync(options.capturePath, result.stdout ?? "");
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? 1}`);
  }
}

function runAgent(args: string[], options: { allowFailure?: boolean; capturePath?: string } = {}) {
  run("agent-device", [
    "--session",
    session,
    "--platform",
    "macos",
    "--session-lock",
    "reject",
    ...args,
  ], options);
}

function writeProfileSteps() {
  const steps = JSON.parse(fs.readFileSync(stepsFile, "utf8")) as AgentDeviceStep[];
  const stepsWithoutClose = steps.filter((step) => step.command !== "close");
  fs.writeFileSync(profileStepsFile, JSON.stringify(stepsWithoutClose, null, 2));
}

async function main() {
  fs.mkdirSync(profileDir, { recursive: true });
  writeProfileSteps();

  const launchArgs = [
    "--",
    `--markdown-e2e=${scenario}`,
    `--markdown-e2e-seed=${seed}`,
    `--markdown-e2e-block-count=${blockCount}`,
  ];

  let profileStarted = false;
  try {
    run("bun", [
      "run",
      "markdown",
      skipBuild ? "open" : "run",
      "macos",
      ...launchArgs,
    ]);

    runAgent(["open", "app.legend.markdown.macos", "--surface", "app", "--no-record"]);
    runAgent(["perf", "metrics", "--json"], { capturePath: path.join(profileDir, "metrics-before.json") });
    runAgent(["perf", "frames", "--json"], { capturePath: path.join(profileDir, "frames-before.json") });
    runAgent(["perf", "cpu", "profile", "start", "--kind", "xctrace", "--out", tracePath]);
    profileStarted = true;
    runAgent(["batch", "--steps-file", profileStepsFile, "--on-error", "stop"]);
    runAgent(["perf", "metrics", "--json"], { capturePath: path.join(profileDir, "metrics-after.json") });
    runAgent(["perf", "frames", "--json"], { capturePath: path.join(profileDir, "frames-after.json") });
  } finally {
    if (profileStarted) {
      runAgent(["perf", "cpu", "profile", "stop", "--kind", "xctrace", "--out", tracePath], { allowFailure: true });
      runAgent(["perf", "cpu", "profile", "report", "--kind", "xctrace", "--out", cpuReportPath], { allowFailure: true });
    }
    runAgent(["close"], { allowFailure: true });
  }

  console.info(`Markdown profile artifacts: ${profileDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
