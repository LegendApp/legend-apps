// @ts-nocheck Bun test globals and the minimal child-process harness.
import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertPreviewHashes, assertRecorderSucceeded, exampleStepPresses, observeRecorder, packArchiveHash, recordingDeckSource, recordingMotionIntervals, recordingSchedule, sha256, snapshotEffectPacks } from "./recording";

function child() {
  const process = new EventEmitter();
  process.stdout = new PassThrough();
  return process;
}

test("recorder exit during navigation remains observable after the step loop", async () => {
  const process = child(), observed = observeRecorder(process);
  process.stdout.write('{"ty');
  process.stdout.write('pe":"ready","firstFrameHostSeconds":100,"hostSeconds":100.2}\n');
  expect(await observed.started).toBeCloseTo(0.2);
  process.emit("exit", 0, null);
  await new Promise(done => setTimeout(done, 5));
  expect(await observed.exited).toEqual({ code: 0, signal: null });
  assertRecorderSucceeded(await observed.exited);
});

test("recorder exit or spawn failure before ready rejects startup", async () => {
  const process = child(), observed = observeRecorder(process);
  process.emit("exit", 2, null);
  await expect(observed.started).rejects.toThrow("before ready");
  expect(() => assertRecorderSucceeded({ code: 2, signal: null })).toThrow("Recorder failed");
  expect(() => assertRecorderSucceeded({ code: null, signal: "SIGINT" })).toThrow("SIGINT");
  const missing = child(), failure = observeRecorder(missing);
  missing.emit("error", new Error("ENOENT"));
  await expect(failure.started).rejects.toThrow("ENOENT");
  const exit = await failure.exited;
  expect(() => assertRecorderSucceeded(exit)).toThrow("ENOENT");
});

test("step schedules leave lead and tail time and reject impossible schedules", () => {
  expect(recordingSchedule(8, 0)).toEqual([]);
  const schedule = recordingSchedule(8, 3);
  expect(schedule[0]).toBe(1500);
  expect(schedule[2]).toBeLessThan(6500);
  expect(() => recordingSchedule(4, 3)).toThrow("exceeds");
  for (const steps of [-1, 1.5, NaN]) expect(() => recordingSchedule(8, steps)).toThrow("--steps");
  for (const seconds of [2, 601, NaN]) expect(() => recordingSchedule(seconds, 0)).toThrow("--seconds");
});

test("MDX step discovery handles render-prop counts without counting the initial state or code samples", () => {
  expect(exampleStepPresses('<Steps count={3}>{step => <View />}</Steps>')).toBe(2);
  expect(exampleStepPresses('<Steps count={2}>{step => <View />}</Steps>')).toBe(1);
  expect(exampleStepPresses('<Step>A</Step>\n\n<Step>B</Step>')).toBe(2);
  expect(exampleStepPresses('<Step at={4}>A</Step>\n\n<Step>B</Step>')).toBe(5);
  expect(exampleStepPresses('```mdx\n<Step />\n```')).toBe(0);
  expect(() => exampleStepPresses('<Steps count={variable}>{step => <View />}</Steps>')).toThrow("--steps");
  for (const [slug, presses] of [["comparison-wipe", 2], ["glass-strike", 1]]) {
    const example = path.resolve(import.meta.dirname, `../../packages/slides-effects/examples/${slug}/example.mdx`);
    expect(exampleStepPresses(fs.readFileSync(example, "utf8"))).toBe(presses);
  }
});

test("pack hashes use the publisher's sorted archive and reject mismatches in either source", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slides-record-hash-test-"));
  try {
    fs.writeFileSync(path.join(directory, "pack.json"), '{"version":"1"}');
    fs.writeFileSync(path.join(directory, "A.tsx"), "export const A = 1;");
    fs.writeFileSync(path.join(directory, "ignored.md"), "not a runtime file");
    fs.mkdirSync(path.join(directory, "nested"));
    fs.writeFileSync(path.join(directory, "nested/Z.ts"), "export const Z = 2;");
    fs.writeFileSync(path.join(directory, "nested/B.json"), "{}");
    const expected = sha256(JSON.stringify({ schemaVersion: 1, files: {
      "A.tsx": "export const A = 1;", "nested/B.json": "{}", "nested/Z.ts": "export const Z = 2;", "pack.json": '{"version":"1"}',
    } }) + "\n");
    expect(packArchiveHash(directory)).toBe(expected);
    const hashes = { exampleSha256: "example", packSha256: expected };
    assertPreviewHashes(hashes, hashes);
    expect(() => assertPreviewHashes(hashes, { ...hashes, exampleSha256: "stale" })).toThrow("refresh");
    expect(() => assertPreviewHashes(hashes, { ...hashes, packSha256: "stale" })).toThrow("refresh");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("audience selection requires the launched process and never falls back to presenter chrome", async () => {
  const { audienceTarget } = await import("./recording");
  const window = { id: 1, title: "Example — Legend Slides", owner: "Legend Slides", pid: 10, width: 1920, height: 1080 };
  const audience = { ...window, id: 2, title: "Legend Slides — Audience" };
  expect(audienceTarget([window], 10)).toBeUndefined();
  expect(audienceTarget([window, { ...audience, pid: 20 }], 10)).toBeUndefined();
  expect(audienceTarget([window, audience], 10, /Example/)).toBeUndefined();
  expect(audienceTarget([window, audience], 10, /Audience/)).toBe(audience);
});

test.skipIf(process.platform !== "darwin")("preflight requires the verifier and python3 before compiling or launching anything", async () => {
  const { spawnSync } = await import("node:child_process");
  const skill = fs.mkdtempSync(path.join(os.tmpdir(), "slides-preflight-test-"));
  const script = path.join(import.meta.dirname, "record.ts");
  const run = () => spawnSync(process.execPath, [script, "glass-strike", "--preflight"], {
    encoding: "utf8", env: { ...process.env, LEGEND_VIDEO_RECORDING_SKILL: skill, PATH: skill },
  });
  try {
    expect(run().stderr).toContain("Video verifier not found");
    fs.mkdirSync(path.join(skill, "scripts"));
    fs.writeFileSync(path.join(skill, "scripts/verify-video.py"), "# fixture");
    const missingPython = run();
    expect(missingPython.status).not.toBe(0);
    expect(missingPython.stderr).toContain("python3 is required");
    expect(missingPython.stdout).not.toContain("Compiling");
  } finally { fs.rmSync(skill, { recursive: true, force: true }); }
});

test("recorder readiness has a deadline even when the process stays alive", async () => {
  const process = child(), observed = observeRecorder(process, 5);
  await expect(observed.started).rejects.toThrow("did not become ready");
  process.emit("exit", 0, null);
  expect(await observed.exited).toEqual({ code: 0, signal: null });
});

test("ready requires native frame timing for trimming and motion checks", async () => {
  const process = child(), observed = observeRecorder(process);
  process.stdout.write('{"type":"ready"}\n');
  await expect(observed.started).rejects.toThrow("native timing");
  process.emit("exit", 0, null);
});

test("motion windows cover finite entrances and individual reveals rather than static tails", () => {
  expect(recordingMotionIntervals(8, [])).toEqual(["0.1:0.5"]);
  expect(recordingMotionIntervals(8, recordingSchedule(8, 2))).toEqual(["1.6:2", "4.1:4.5"]);
  expect(recordingMotionIntervals(8, [], ["0.1:7.5"])).toEqual(["0.1:7.5"]);
  for (const value of ["", ":1", "0:9", "1:0", "NaN:1", "0:1:2"]) {
    expect(() => recordingMotionIntervals(8, [], [value])).toThrow("--motion");
  }
});

test("the capture deck holds the example after a blank slide and compiles only snapshot pack sources", async () => {
  const { compileDeck } = await import("../../packages/presentation/src/compiler/compileDeck");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "slides-record-snapshot-test-"));
  const packs = path.resolve(import.meta.dirname, "../../packages/slides-effects/packs");
  const example = fs.readFileSync(path.resolve(import.meta.dirname, "../../packages/slides-effects/examples/animated-title/example.mdx"), "utf8");
  const capturePacks = path.join(directory, "packs");
  const deck = path.join(directory, "capture.mdx");
  const previous = process.env.LEGEND_SLIDES_EFFECT_PACKS;
  try {
    snapshotEffectPacks(packs, capturePacks, "typography", packArchiveHash(path.join(packs, "typography")));
    expect(() => snapshotEffectPacks(packs, path.join(directory, "stale"), "typography", "wrong")).toThrow("changed");
    fs.writeFileSync(deck, recordingDeckSource(example));
    // This is the environment inherited by the release helper as well as dev compilers.
    process.env.LEGEND_SLIDES_EFFECT_PACKS = capturePacks;
    const result = await compileDeck(deck);
    expect(result.success).toBe(true);
    expect(result.dependencies).toContain(path.join(capturePacks, "typography/AnimatedTitle.tsx"));
    expect(result.dependencies.some(file => file.startsWith(packs))).toBe(false);
    expect(result.code).toContain("Make an entrance");
    // Exercise the same remark transform used by the compiler to check the slide boundary.
    const { createRequire } = await import("node:module");
    const require = createRequire(path.resolve(import.meta.dirname, "../../packages/presentation/package.json"));
    const { createProcessor } = require("@mdx-js/mdx");
    const { remarkSlides } = await import("../../packages/presentation/src/compiler/remarkSlides");
    const processor = createProcessor({ remarkPlugins: [require("remark-frontmatter").default] });
    const ast = processor.parse(recordingDeckSource(example));
    remarkSlides()(ast);
    const slides = ast.children.find(node => node.name === "Deck").children.filter(node => node.name === "Slide");
    expect(slides).toHaveLength(2);
    expect(slides[0].children).toHaveLength(0);
    expect(slides[1].children.length).toBeGreaterThan(0);
    expect(recordingDeckSource("# No frontmatter")).toStartWith("\n<SlideSeparator />");
  } finally {
    if (previous === undefined) delete process.env.LEGEND_SLIDES_EFFECT_PACKS;
    else process.env.LEGEND_SLIDES_EFFECT_PACKS = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
