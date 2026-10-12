import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { smokeLaunchMacOSApp } from "./macosSmoke";

function fixture(t: TestContext, source: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "macos-smoke-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const executablePath = path.join(dir, "Smoke Fixture");
  const pidFile = path.join(dir, "pid");
  const argsFile = path.join(dir, "args");
  fs.writeFileSync(executablePath, `#!${process.execPath}\nimport fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\nfs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));\n${source}\n`, { mode: 0o755 });
  return {
    dir,
    argsFile,
    launch: () => smokeLaunchMacOSApp({ executablePath, appId: "example", arch: "arm", reportsDir: dir, durationMs: 400 }),
    assertStopped: () => assert.throws(() => process.kill(Number(fs.readFileSync(pidFile, "utf8")), 0), /ESRCH/),
  };
}

test("smoke launch passes a live process, ignores old reports, and quits it", async t => {
  const f = fixture(t, "setInterval(() => {}, 100);");
  fs.writeFileSync(path.join(f.dir, "Smoke Fixture-old.ips"), "old report");
  await f.launch();
  assert.deepEqual(JSON.parse(fs.readFileSync(f.argsFile, "utf8")), ["--legend-smoke"]);
  f.assertStopped();
});

test("smoke launch fails on an early exit and reports fatal JavaScript output", async t => {
  const f = fixture(t, `console.error("TurboModuleRegistry.getEnforcing: 'MissingModule' could not be found"); process.exit(47);`);
  await assert.rejects(f.launch(), error => {
    assert.match(String(error), /Release smoke launch failed: example \(arm\) exited after .* \(status 47\)/);
    assert.match(String(error), /reason: TurboModuleRegistry.getEnforcing.*MissingModule/);
    assert.match(String(error), /apps\/example\/app.manifest.ts nativeModules.macos/);
    return true;
  });
  f.assertStopped();
});

test("smoke launch detects a new crash report while the process is alive and quits it", async t => {
  const f = fixture(t, `setTimeout(() => fs.writeFileSync(new URL("./Smoke Fixture-new.ips", import.meta.url), '{}\\n' + JSON.stringify({ termination: { reason: "Missing native framework" } })), 50); setInterval(() => {}, 100);`);
  await assert.rejects(f.launch(), error => {
    assert.match(String(error), /crashed after/);
    assert.match(String(error), /reason: .*Missing native framework/);
    assert.match(String(error), /crash report: .*Smoke Fixture-new.ips/);
    return true;
  });
  f.assertStopped();
});

test("smoke launch kills a process that ignores SIGTERM", { timeout: 10_000 }, async t => {
  const f = fixture(t, `process.on("SIGTERM", () => {}); setInterval(() => {}, 100);`);
  await f.launch();
  f.assertStopped();
});

test("smoke launch reports a missing executable as a release failure", async t => {
  const f = fixture(t, "");
  fs.unlinkSync(path.join(f.dir, "Smoke Fixture"));
  await assert.rejects(f.launch(), /Release smoke launch failed: example \(arm\).*ENOENT/s);
});
