// @ts-nocheck Run the CLI in an isolated checkout fixture.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const { parse } = createRequire(path.resolve(import.meta.dirname, "../../packages/presentation/package.json"))("yaml");

function fixture(run) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "slides-add-test-"));
  const root = path.join(repo, "packages/slides-effects");
  const script = path.join(repo, "scripts/slides-effects/add.ts");
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(path.join(import.meta.dirname, "add.ts"), script);
  fs.mkdirSync(path.join(root, "packs/test"), { recursive: true });
  fs.writeFileSync(path.join(root, "packs/test/pack.json"), '{"version":"1.0.0","exports":{}}');
  fs.writeFileSync(path.join(root, "catalog.json"), '{"effects":[]}');
  try { run(root, args => spawnSync(process.execPath, [script, "test/example", "--export", "Example", "--scaffold-export", ...args], { encoding: "utf8" })); }
  finally { fs.rmSync(repo, { recursive: true, force: true }); }
}

test("all duplicate checks run before scaffolding changes a pack", () => {
  for (const duplicate of ["catalog", "example"]) fixture((root, run) => {
    if (duplicate === "catalog") fs.writeFileSync(path.join(root, "catalog.json"), '{"effects":[{"slug":"example"}]}');
    else {
      fs.mkdirSync(path.join(root, "examples/example"), { recursive: true });
      fs.writeFileSync(path.join(root, "examples/example/example.mdx"), "# Existing");
    }
    const manifest = fs.readFileSync(path.join(root, "packs/test/pack.json"), "utf8");
    expect(run([]).status).not.toBe(0);
    expect(fs.existsSync(path.join(root, "packs/test/Example.tsx"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "packs/test/pack.json"), "utf8")).toBe(manifest);
    if (duplicate === "example") expect(fs.readFileSync(path.join(root, "examples/example/example.mdx"), "utf8")).toBe("# Existing");
  });
});

test("scaffold quotes YAML titles with colons, quotes and comment characters", () => fixture((root, run) => {
  const title = 'Example: "quoted" # heading';
  expect(run(["--title", title]).status).toBe(0);
  const source = fs.readFileSync(path.join(root, "examples/example/example.mdx"), "utf8");
  expect(parse(source.split("---")[1]).title).toBe(title);
  expect(JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8")).effects[0].snippet).toBe(source);
}));
