import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { defaultAgentSession, retryOnRunnerBusy, type StepResult } from "./e2eSession";

const busy = "Error (COMMAND_FAILED): Batch failed at step 2 (wait): The iOS runner is still finishing a previous command that exceeded its execution watchdog (usually an accessibility capture on a heavy or animating screen).";

test("default session is unique to the job, else to the process", () => {
  assert.equal(defaultAgentSession("markdown-e2e", { JOB_NAME: "list-k11" }, 7), "list-k11-markdown-e2e");
  assert.equal(defaultAgentSession("markdown-e2e", { JOB_DIR: "/jobs/list-k11-e2e-20261119" }, 7), "list-k11-e2e-20261119-markdown-e2e");
  assert.equal(defaultAgentSession("markdown-e2e", {}, 4242), "markdown-e2e-pid4242");
  assert.equal(defaultAgentSession("markdown-e2e", { AGENT_DEVICE_SESSION: "mine", JOB_NAME: "j" }, 7), "mine");
});

test("a busy runner is reset and the step retried once", async () => {
  const results: StepResult[] = [{ status: 1, output: busy }, { status: 0, output: "" }];
  let attempts = 0;
  let recoveries = 0;
  const result = await retryOnRunnerBusy(async () => results[attempts++]!, async () => { recoveries++; });
  assert.deepEqual([result.status, attempts, recoveries], [0, 2, 1]);
});

test("a runner still busy after the retry fails without a second recovery", async () => {
  let attempts = 0;
  let recoveries = 0;
  const result = await retryOnRunnerBusy(async () => { attempts++; return { status: 1, output: busy }; }, async () => { recoveries++; });
  assert.deepEqual([result.status, attempts, recoveries], [1, 2, 1]);
});

test("other failures are not retried", async () => {
  let attempts = 0;
  let recoveries = 0;
  const result = await retryOnRunnerBusy(async () => { attempts++; return { status: 1, output: "Error (DEVICE_IN_USE): Device is already in use by session \"x\"." }; }, async () => { recoveries++; });
  assert.deepEqual([result.status, attempts, recoveries], [1, 1, 0]);
});

// A script that opens session `job-e2e`, starts a long step, then exits or waits to be stopped.
async function runFixture(mode: "exit" | "sigterm") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-session-"));
  const log = path.join(dir, "agent-device.log");
  fs.writeFileSync(path.join(dir, "agent-device"), `#!/bin/sh\necho "$@" >> "${log}"\n`, { mode: 0o755 });
  const script = path.join(dir, "fixture.ts");
  fs.writeFileSync(script, `
    import { agentDevice, runStep } from ${JSON.stringify(path.join(__dirname, "e2eSession"))};
    agentDevice("job-e2e");
    const step = runStep("sleep", ["${mode === "exit" ? "0" : "30"}"]);
    console.log("started");
    await step;
  `);
  const child = spawn("bun", [script], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, stdio: ["ignore", "pipe", "inherit"] });
  child.stdout.once("data", () => { if (mode === "sigterm") setTimeout(() => child.kill("SIGTERM"), 200); });
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  return { code, calls: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "" };
}

test("the session is closed when the script exits", async () => {
  const { code, calls } = await runFixture("exit");
  assert.equal(code, 0);
  assert.match(calls, /--session job-e2e .*close/);
});

test("the session is closed when the script is stopped with SIGTERM mid-step", async () => {
  const started = Date.now();
  const { code, calls } = await runFixture("sigterm");
  assert.equal(code, 143);
  assert.ok(Date.now() - started < 10_000, "stop did not wait for the running step");
  assert.match(calls, /--session job-e2e .*close/);
  assert.doesNotMatch(calls, /--session (?!job-e2e )/);
});
