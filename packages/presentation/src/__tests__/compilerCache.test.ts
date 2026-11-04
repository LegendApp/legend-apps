// @ts-nocheck Standalone compiler processes exercise the same boundary as the app.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

test("source transforms survive process restarts and invalidate by content without bypassing resolution", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-cache-test-"));
  const deck = path.join(root, "deck/deck.mdx"), cache = path.join(root, "cache");
  const pack = path.join(root, "deck/effects/motion");
  fs.mkdirSync(pack, { recursive: true });
  fs.writeFileSync(deck, 'export { sample } from "slides:motion/Pose"\n\n# Original');
  fs.writeFileSync(path.join(pack, "pack.json"), JSON.stringify({ id: "motion", version: "1.0.0", hostApiVersion: 1, exports: { Pose: "./Pose.ts" } }));
  fs.writeFileSync(path.join(pack, "Pose.ts"), 'import { factor } from "./math"; export function sample(x) { "worklet"; return x * factor; }');
  const math = path.join(pack, "math.ts");
  fs.writeFileSync(math, "export const factor = 2;");
  async function compile(source?: string, directory = cache, env = {}) {
    const child = Bun.spawn([process.execPath, path.resolve(import.meta.dirname, "../../../../scripts/compile-slides.ts"), deck, "--timings", ...(source === undefined ? [] : ["--draft"])], {
      env: { ...process.env, LEGEND_SLIDES_TRANSFORM_CACHE: directory, ...env },
      stdin: source === undefined ? "ignore" : new TextEncoder().encode(source), stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(status).toBe(0);
    const result = JSON.parse(gunzipSync(Buffer.from(JSON.parse(stdout).data, "base64")).toString());
    return { result, timings: JSON.parse(stderr.trim()).timings };
  }
  function value(result) {
    expect(result.success).toBe(true);
    const module = { exports: {} };
    Function("require", "module", "exports", result.code)(() => ({}), module, module.exports);
    return module.exports.sample(21);
  }
  try {
    const cold = await compile();
    expect(cold.timings.transformCacheRead).toBeUndefined();
    const warm = await compile();
    expect(warm.timings.transformCacheRead).toBeGreaterThan(0);
    expect(warm.result).toEqual(cold.result);
    expect((await compile(undefined, "")).result).toEqual(cold.result);

    const draft = fs.readFileSync(deck, "utf8").replace("Original", "Changed");
    expect((await compile(draft)).result).toEqual((await compile(draft, "")).result);
    expect(fs.readFileSync(deck, "utf8")).toContain("Original");
    const stat = fs.statSync(math);
    fs.writeFileSync(math, "export const factor = 3;");
    fs.utimesSync(math, stat.atime, stat.mtime);
    const edited = await compile(draft);
    expect(value(edited.result)).toBe(63);
    expect(edited.result).toEqual((await compile(draft, "")).result);
    expect(fs.readdirSync(cache)).toHaveLength(3);
    const nativeMath = path.join(pack, "math.macos.ts");
    fs.writeFileSync(nativeMath, "export const factor = 4;");
    expect(value((await compile(draft)).result)).toBe(84);
    fs.rmSync(nativeMath);
    expect(value((await compile(draft)).result)).toBe(63);

    const production = { NODE_ENV: "production", BABEL_ENV: "production" };
    expect((await compile(draft, cache, production)).timings.transformCacheRead).toBeUndefined();
    expect((await compile(draft, cache, production)).result).toEqual((await compile(draft, "", production)).result);
    for (const name of fs.readdirSync(cache)) {
      const file = path.join(cache, name);
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^[^\n]*/, "old compiler"));
    }
    expect((await compile(draft, cache, production)).timings.transformCacheRead).toBeUndefined();
    for (const name of fs.readdirSync(cache)) fs.writeFileSync(path.join(cache, name), "damaged");
    expect(value((await compile()).result)).toBe(63);
    for (const name of fs.readdirSync(cache)) {
      const file = path.join(cache, name);
      fs.writeFileSync(file, fs.readFileSync(file, "utf8").slice(0, -3));
    }
    expect((await compile()).timings.transformCacheRead).toBeUndefined();
    expect(value((await compile()).result)).toBe(63);
    for (let index = 0; index < 260; index++) fs.writeFileSync(path.join(cache, `unused-${index}.cache`), "damaged");
    expect(value((await compile(draft)).result)).toBe(63);
    expect(fs.readdirSync(cache).length).toBeLessThanOrEqual(256);
    const unavailable = path.join(root, "unavailable");
    fs.writeFileSync(unavailable, "file instead of directory");
    expect(value((await compile(undefined, unavailable)).result)).toBe(63);

    fs.writeFileSync(path.join(pack, "pack.json"), JSON.stringify({ id: "motion", version: "1.0.0", hostApiVersion: 1, exports: {} }));
    expect((await compile()).result).toMatchObject({ success: false });
    fs.rmSync(path.join(pack, "pack.json"));
    expect((await compile()).result).toMatchObject({ success: false });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 30_000);
