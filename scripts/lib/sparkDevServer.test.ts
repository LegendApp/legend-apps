import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { rootDir } from "./apps";
import { runCommand } from "./run";
import { runSparkDevServer } from "./sparkDevServer";

const project = path.join(rootDir, "shell/.legend/spark/slides");

async function metro(root: string | undefined = project, body: string | null = "packager-status:running") {
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.url, "/status");
    if (body === null) return;
    if (root) response.setHeader("X-React-Native-Project-Root", encodeURI(root));
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { server, port, requests: () => requests, close: async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  } };
}

function recorder() {
  const calls: Parameters<typeof runCommand>[] = [];
  const execute: typeof runCommand = (...args) => { calls.push(args); };
  return { calls, execute };
}

test("rerunning Slides opens the app twice against the same live server and preserves launch arguments", async () => {
  const existing = await metro();
  const { calls, execute } = recorder();
  const env = { LEGEND_APP: "slides" };
  try {
    for (let i = 0; i < 2; i++) {
      await runSparkDevServer({ appId: "slides", project, cli: "spark.js",
        runnerArgs: ["--port", String(existing.port)], appArgs: ["/tmp/my deck.mdx", "--preview"], env }, execute);
    }
    assert.equal(existing.requests(), 2);
    assert.equal(existing.server.listening, true);
    assert.deepEqual(calls, Array.from({ length: 2 }, () => ["bun", ["scripts/open-app.ts", "slides", "macos",
      "--port", String(existing.port), "--", "/tmp/my deck.mdx", "--preview"], { cwd: rootDir, env }]));
  } finally { await existing.close(); }
});

test("start and --no-open reuse Metro without launching an app or another dev session", async () => {
  const existing = await metro();
  const { calls, execute } = recorder();
  try {
    await runSparkDevServer({ appId: "slides", project, cli: "spark.js",
      runnerArgs: [`--port=${existing.port}`], noOpen: true }, execute);
    await runSparkDevServer({ appId: "slides", project, cli: "spark.js",
      runnerArgs: [`--port=${existing.port}`, "--no-open"] }, execute);
    assert.equal(existing.requests(), 2);
    assert.equal(existing.server.listening, true);
    assert.deepEqual(calls, []);
  } finally { await existing.close(); }
});

test("a stopped server starts the original Spark dev path with its options and app arguments", async () => {
  const previous = await metro();
  await previous.close();
  const { calls, execute } = recorder();
  await runSparkDevServer({ appId: "slides", project, cli: "spark.js",
    runnerArgs: [`--port=${previous.port}`, "--clear"], appArgs: ["/tmp/my deck.mdx"] }, execute);
  assert.deepEqual(calls, [["node", ["spark.js", "dev", `--port=${previous.port}`, "--clear",
    "--app-arg=/tmp/my deck.mdx"], { cwd: project, env: undefined }]]);
});

test("reuse retains requested bundle options when opening the app", async () => {
  const existing = await metro();
  const { calls, execute } = recorder();
  try {
    await runSparkDevServer({ appId: "slides", project, cli: "spark.js",
      runnerArgs: ["--port", String(existing.port), "--no-dev", "--minify"] }, execute);
    assert.deepEqual(calls[0]?.[1], ["scripts/open-app.ts", "slides", "macos", "--port",
      String(existing.port), "--no-dev", "--minify", "--"]);
  } finally { await existing.close(); }
});

test("another project's Metro is left running and never used to open Slides", async () => {
  const existing = await metro(path.join(rootDir, "shell/.legend/spark/music"));
  const { calls, execute } = recorder();
  try {
    await assert.rejects(runSparkDevServer({ appId: "slides", project, cli: "spark.js",
      runnerArgs: ["--port", String(existing.port)] }, execute), /serves .*music, not .*slides/);
    assert.equal(existing.server.listening, true);
    assert.deepEqual(calls, []);
  } finally { await existing.close(); }
});

test("an unrelated HTTP server or missing project identity cannot be reused", async () => {
  for (const [root, body] of [[project, "hello"], ["", "packager-status:running"]]) {
    const existing = await metro(root, body);
    const { calls, execute } = recorder();
    try {
      await assert.rejects(runSparkDevServer({ appId: "slides", project, cli: "spark.js",
        runnerArgs: ["--port", String(existing.port)] }, execute), /unrecognized server/);
      assert.equal(existing.server.listening, true);
      assert.deepEqual(calls, []);
    } finally { await existing.close(); }
  }
});

test("encoded paths and symlinks identify the same project", async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "spark server "));
  const alias = path.join(temporary, "alias");
  fs.symlinkSync(project, alias, "dir");
  const existing = await metro(alias);
  const { calls, execute } = recorder();
  try {
    await runSparkDevServer({ appId: "slides", project, cli: "spark.js",
      runnerArgs: ["--port", String(existing.port)] }, execute);
    assert.equal(calls[0]?.[0], "bun");
  } finally { await existing.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
});

test("an unresponsive listener fails promptly without attempting another dev server", async () => {
  const existing = await metro(project, null);
  const { calls, execute } = recorder();
  try {
    await assert.rejects(runSparkDevServer({ appId: "slides", project, cli: "spark.js",
      runnerArgs: ["--port", String(existing.port)] }, execute), /Could not check the dev server/);
    assert.equal(existing.server.listening, true);
    assert.deepEqual(calls, []);
  } finally { await existing.close(); }
});
