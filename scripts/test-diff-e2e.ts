#!/usr/bin/env bun
import os from "node:os";
import path from "node:path";
import { rootDir } from "./lib/apps";
import { check, runStep } from "./lib/e2eSession";

const requestedScenario = process.env.DIFF_E2E_SCENARIO;
const scenario = requestedScenario === "app-surface-smoke" || requestedScenario === "file-filter-smoke"
  ? requestedScenario
  : "local-folder-smoke";
const artifactsDir = path.join(rootDir, ".artifacts", "diff-e2e");
const devroot = process.env.DEVROOT ?? path.join(os.homedir(), "devroot");
const log = process.env.DIFF_E2E_LOG ?? path.join(artifactsDir, scenario + ".log");
const screenshots = process.env.DIFF_E2E_SCREENSHOTS;
const harness = path.join(devroot, "harness", "legend-apps", "diff-e2e-scenario.sh");
if (!await Bun.file(harness).exists()) {
  throw new Error("Set DEVROOT to the workspace containing harness/legend-apps/diff-e2e-scenario.sh.");
}

if (process.env.DIFF_E2E_SKIP_BUILD !== "1") {
  check(await runStep(path.join(devroot, "scripts", "heavy"), [
    "legend-apps", "--", "bun", "run", "diff", "build", "macos", "--dev",
  ]));
}
check(await runStep(harness, [
  "--worktree", rootDir, "--scenario", scenario, "--log", log,
  ...(screenshots ? ["--screenshots", screenshots] : []),
]));
