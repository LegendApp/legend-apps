import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("the commit guard rejects staged local SDK pins and permits uncommitted test overrides", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spark-published-dependency-"));
  const script = path.join(import.meta.dirname, "verify-spark-dependency.ts");
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  const manifest = (pin = "0.0.1-next.2") => fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ catalog: { "@legendapp/spark": pin }, dependencies: { "@legendapp/spark": "catalog:" } }));
  const lock = (resolution = "@legendapp/spark@0.0.1-next.2") => fs.writeFileSync(path.join(root, "bun.lock"), JSON.stringify({ packages: { "@legendapp/spark": [resolution, "", {}, "integrity"] } }));
  const check = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  try {
    git("init", "-q");
    manifest(); lock(); git("add", "package.json", "bun.lock");
    assert.equal(check("--staged").status, 0);
    manifest("file:../legend-spark/local.tgz"); lock("@legendapp/spark@../legend-spark/local.tgz");
    assert.equal(check().status, 1);
    assert.equal(check("--staged").status, 0);
    git("add", "package.json");
    assert.match(check("--staged").stderr, /published npm version/);
    manifest(); git("add", "package.json", "bun.lock");
    assert.match(check("--staged").stderr, /bun.lock must remain uncommitted/);
    lock(); git("add", "bun.lock");
    assert.equal(check("--staged").status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
