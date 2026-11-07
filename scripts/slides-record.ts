#!/usr/bin/env bun
// Headless recorder: launches the native Slides dev build on a deck, drives slides and steps over the Metro
// inspector, captures the full-screen audience window at device pixels, and quits the app it launched.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveDevServerPort } from "./lib/apps";
import { matchingMetro } from "./lib/sparkDevServer";
import { assertRecorderSucceeded, observeRecorder } from "./slides-effects/recording";

const usage = `Usage: bun run slides:record <deck.mdx> [options]

Stills (PNG, audience window at device pixels):
  --slide LIST       1-based slides, e.g. 14 or 14,18,22-23 (default: all with --all)
  --step N           1-based step of each slide (default: every step)
  --all              every step of every slide
  --out FILE.png     output for exactly one still
  --out-dir DIR      output directory for several stills: slide-14-step-1.png… (default: current directory)
  --settle MS        wait after each navigation before a still (default 2500)

Video (MP4, 60 fps, ScreenCaptureKit):
  --video FILE.mp4   record one --slide: entering it from the previous slide, then each step
  --step-seconds S   time on each step (default 3)

  --port N           Metro port (default: the slides dev port); Metro is started and stopped if not running
  --app PATH         Slides .app bundle (default: the dev build from bun run slides build macos --dev)
  --effect-packs DIR resolve slides: imports from DIR, e.g. packages/slides-effects/packs (default: installed packs)
  --wait S           wait up to S seconds for another Legend Slides instance to quit (default 600)
  --reserve-bytes N  free-space floor for video capture (default 5000000000)

Debug builds only. Video and window lookup use the video-recording skill's recorder: set
LEGEND_VIDEO_RECORDING_SKILL (or LEGEND_RECORD_MACOS to a compiled one). Runs under LEGEND_APP_LOCK when set.
Needs Screen Recording permission for the host process; no Accessibility permission or input events.`;

const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) { console.log(usage); process.exit(args.length ? 0 : 2); }
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name: string) => args.includes(name);
const number = (name: string, fallback: number) => {
  const value = Number(option(name) ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a nonnegative number.`);
  return value;
};
if (process.platform !== "darwin") throw new Error("slides:record runs on macOS only.");

const appLock = process.env.LEGEND_APP_LOCK;
if (!process.env.LEGEND_SLIDES_RECORD_LOCKED && appLock && fs.existsSync(appLock)) {
  const result = spawnSync(appLock, ["slides", "--", process.execPath, import.meta.filename, ...args], {
    stdio: "inherit", env: { ...process.env, LEGEND_SLIDES_RECORD_LOCKED: "1" } });
  process.exit(result.status ?? 1);
}

const repo = path.resolve(import.meta.dirname, "..");
const deck = path.resolve(args[0]);
if (!deck.endsWith(".mdx") || !fs.existsSync(deck)) throw new Error(`Pass an existing .mdx deck first (got ${args[0]}).`);
const video = option("--video") && path.resolve(option("--video")!);
const out = option("--out") && path.resolve(option("--out")!);
const outDir = path.resolve(option("--out-dir") ?? ".");
const settle = number("--settle", 2500), stepSeconds = number("--step-seconds", 3), wait = number("--wait", 600);
const reserve = String(number("--reserve-bytes", 5e9));
const port = resolveDevServerPort("slides", args);
const effectPacks = option("--effect-packs") && path.resolve(option("--effect-packs")!);
const slideList = option("--slide")?.split(",").flatMap(part => {
  const [from, to = from] = part.split("-").map(Number);
  if (!(from >= 1 && to >= from)) throw new Error(`Invalid --slide ${part}`);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
});
const stepArg = option("--step") === undefined ? undefined : Number(option("--step"));
if (stepArg !== undefined && !(Number.isInteger(stepArg) && stepArg >= 1)) throw new Error("--step must be a positive integer.");
if (!slideList && !flag("--all")) throw new Error("Pass --slide LIST or --all.");
if (video && slideList?.length !== 1) throw new Error("--video records exactly one --slide.");

const appPath = option("--app") ?? (() => {
  const record = path.join(repo, "shell/.legend/spark/slides-shared-debug/.spark/shared-debug.json");
  return fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, "utf8")).app as string : undefined;
})();
if (!appPath || !fs.existsSync(appPath)) throw new Error("No Slides dev build. Run: bun run slides build macos --dev (or pass --app).");
const executable = spawnSync("plutil", ["-extract", "CFBundleExecutable", "raw", "-o", "-", path.join(appPath, "Contents/Info.plist")], { encoding: "utf8" });
if (executable.status !== 0) throw new Error(`Could not read the Slides executable: ${executable.stderr}`);
const binary = path.join(appPath, "Contents/MacOS", executable.stdout.trim());

const run = (command: string, commandArgs: string[]) => spawnSync(command, commandArgs, { encoding: "utf8" });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const recorder = process.env.LEGEND_RECORD_MACOS ?? path.join(os.tmpdir(), "legend-slides-effects-recorder/record-macos");
if (!fs.existsSync(recorder)) {
  const source = process.env.LEGEND_VIDEO_RECORDING_SKILL && path.join(process.env.LEGEND_VIDEO_RECORDING_SKILL, "scripts/record-macos.swift");
  if (!source || !fs.existsSync(source)) throw new Error("Set LEGEND_VIDEO_RECORDING_SKILL to the video-recording skill directory, or LEGEND_RECORD_MACOS to its compiled recorder.");
  fs.mkdirSync(path.dirname(recorder), { recursive: true });
  const built = run("xcrun", ["swiftc", "-O", source, "-o", recorder]);
  if (built.status !== 0) throw new Error(`Compiling the recorder failed:\n${built.stderr}`);
}
type ListedWindow = { id: number; pid: number; title: string; width: number; height: number };
function appWindows(pid: number): ListedWindow[] {
  const result = run(recorder, ["--list"]);
  const message = JSON.parse(`${result.stdout}\n${result.stderr}`.trim().split("\n").filter(line => line.startsWith("{")).pop() ?? "{}");
  if (message.type === "error") throw new Error(`Recorder: ${message.message}`);
  return (message.windows ?? []).filter((w: ListedWindow) => w.pid === pid);
}
const audienceWindow = (pid: number) => appWindows(pid).find(w => /Audience/.test(w.title) && w.width > 200);

const otherInstances = () => run("pgrep", ["-f", "/(Legend Slides|LegendSlides)[.]app/Contents/MacOS/"]).stdout.trim();
const metroUp = () => matchingMetro(path.join(repo, "shell/.legend/spark/slides-shared-debug"), port, false);

// Hermes' inspector does not await promises, so calls park their result on a global that is polled.
async function connect(url: string) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map<number, (message: any) => void>();
  ws.onmessage = event => { const m = JSON.parse(String(event.data)); pending.get(m.id)?.(m); pending.delete(m.id); };
  const send = (expression: string) => new Promise<any>((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error("Inspector timed out")); }, 30_000);
    pending.set(key, m => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); });
    ws.send(JSON.stringify({ id: key, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });
  let calls = 0;
  const call = async (expression: string) => {
    const key = `__legendSlidesRecorderResult${++calls}`;
    await send(`globalThis.${key}=undefined;Promise.resolve().then(()=>${expression}).then(value=>{globalThis.${key}={value}},error=>{globalThis.${key}={error:String(error)}});0`);
    for (const deadline = Date.now() + 120_000; Date.now() < deadline; await sleep(50)) {
      const value = (await send(`globalThis.${key}`)).result.value;
      if (value) { void send(`delete globalThis.${key}`); if (value.error) throw new Error(value.error); return value.value; }
    }
    throw new Error(`Timed out: ${expression}`);
  };
  return { call, close: () => ws.close() };
}

let app: ChildProcess | undefined, metro: ChildProcess | undefined;
const cleanup = async () => {
  if (app?.pid && app.exitCode === null) {
    process.kill(app.pid, "SIGTERM");
    for (let i = 0; i < 50 && app.exitCode === null && app.signalCode === null; i++) await sleep(200);
    if (app.exitCode === null && app.signalCode === null) process.kill(app.pid, "SIGKILL");
  }
  if (metro?.pid && metro.exitCode === null) try { process.kill(-metro.pid, "SIGTERM"); } catch {}
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => void cleanup().then(() => process.exit(130)));

const written: string[] = [];
try {
  // Only one Legend Slides instance can own the full-screen audience; another job's app would hide ours.
  for (const deadline = Date.now() + wait * 1000; otherInstances(); await sleep(5000)) {
    if (Date.now() > deadline) throw new Error(`Another Legend Slides instance is still running (pid ${otherInstances()}).`);
  }
  if (!(await metroUp())) {
    console.log(`Starting Metro on ${port}…`);
    metro = spawn("bun", ["scripts/start-app.ts", "slides", "macos", "--port", String(port)], { cwd: repo, detached: true, stdio: "ignore" });
    for (let i = 0; i < 120 && !(await metroUp()); i++) await sleep(1000);
    if (!(await metroUp())) throw new Error(`Metro did not start on ${port}.`);
  }
  // Launch the binary directly so its PID is ours and it inherits a PATH with bun for the deck compiler.
  app = spawn(binary, ["-ApplePersistenceIgnoreState", "YES", "-RCT_jsLocation", `127.0.0.1:${port}`], {
    detached: true, stdio: "ignore", env: { ...process.env, SPARK_BUNDLE_URL: `http://127.0.0.1:${port}/index.bundle?platform=macos&dev=true&minify=false`, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`, ...effectPacks && { LEGEND_SLIDES_EFFECT_PACKS: effectPacks } } });
  console.log(`Launched ${binary} (pid ${app.pid})`);
  let control: Awaited<ReturnType<typeof connect>> | undefined;
  for (let i = 0; i < 120 && !control; i++, await sleep(1000)) {
    if (app.exitCode !== null) throw new Error(`Legend Slides exited (${app.exitCode}) during launch.`);
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json(), () => []) as { description?: string; webSocketDebuggerUrl: string }[];
    const target = targets.find(t => t.description?.startsWith("React Native Bridgeless"));
    if (!target) continue;
    const candidate = await connect(target.webSocketDebuggerUrl).catch(() => undefined);
    if (await candidate?.call("typeof globalThis.__legendSlidesRecorder").catch(() => undefined) === "object") control = candidate;
    else candidate?.close();
  }
  if (!control) throw new Error(`The app's JS runtime never attached to Metro on ${port}; check Metro's output for bundle errors.`);
  const call = (expression: string) => control!.call(`globalThis.__legendSlidesRecorder.${expression}`);
  let state = await call(`open(${JSON.stringify(deck)})`);
  if (state.status !== "ready" || state.buildErrors.length) throw new Error(`Deck did not build: ${JSON.stringify(state.buildErrors)}`);
  const display = await call("present()");
  await sleep(2000);
  let window = audienceWindow(app.pid!);
  if (!window) throw new Error("No audience window found for the launched app.");
  const steps: number[] = state.steps;
  const slides = slideList ?? steps.map((_, i) => i + 1);
  for (const slide of slides) if (slide > steps.length) throw new Error(`Slide ${slide} is past the deck's ${steps.length} slides.`);
  const errors = new Set<string>();
  const navigate = async (expression: string) => {
    state = await call(expression);
    for (const error of state.runtimeErrors) if (!errors.has(error)) { errors.add(error); console.error(`Runtime error: ${error}`); }
  };

  if (video) {
    fs.mkdirSync(path.dirname(video), { recursive: true });
    const slide = slides[0], count = steps[slide - 1];
    if (slide > 1) { await navigate(`go(${slide - 2})`); for (let i = 1; i < steps[slide - 2]; i++) await navigate("next()"); await sleep(settle); }
    const seconds = Math.ceil(1 + count * stepSeconds);
    const raw = `${video}.raw-${process.pid}.mp4`;
    const width = Math.min(3840, Math.round(display.size.width * display.scaleFactor / 2) * 2);
    const recording = spawn(recorder, ["--window-id", String(window.id), "--output", raw, "--seconds", String(seconds), "--fps", "60", "--width", String(width), "--reserve-bytes", reserve], { stdio: ["ignore", "pipe", "inherit"] });
    const events = observeRecorder(recording);
    await events.started;
    await sleep(500);
    await navigate(`go(${slide - 1})`);
    for (let i = 1; i < count; i++) { await sleep(stepSeconds * 1000); await navigate("next()"); }
    assertRecorderSucceeded(await events.exited);
    fs.renameSync(raw, video);
    for (const suffix of [".frames.jsonl", ".capture.json"]) if (fs.existsSync(raw + suffix)) fs.renameSync(raw + suffix, video + suffix);
    written.push(video);
  } else {
    const shots = slides.flatMap(slide => Array.from({ length: steps[slide - 1] }, (_, i) => [slide, i + 1]))
      .filter(([, step]) => stepArg === undefined || step === stepArg);
    if (!shots.length) throw new Error(`No slide has step ${stepArg}.`);
    if (out && shots.length !== 1) throw new Error(`--out takes one still; this selects ${shots.length}. Use --out-dir.`);
    fs.mkdirSync(out ? path.dirname(out) : outDir, { recursive: true });
    for (const [slide, step] of shots) {
      if (state.slide !== slide - 1) await navigate(`go(${slide - 1})`);
      while (state.step < step - 1) await navigate("next()");
      await sleep(settle);
      const file = out ?? path.join(outDir, `slide-${String(slide).padStart(2, "0")}-step-${step}.png`);
      const capture = () => run("/usr/sbin/screencapture", ["-x", "-o", `-l${window!.id}`, file]).status === 0 && fs.existsSync(file);
      // Another app taking the screen moves the full-screen audience off-screen, where it can't be captured: present it again.
      for (let attempt = 1; !capture(); attempt++) {
        if (attempt > 12) throw new Error(`Could not capture slide ${slide} step ${step}; on-screen app windows: ${JSON.stringify(appWindows(app.pid!))}`);
        console.warn(`The audience window is off-screen; presenting it again (${attempt})…`);
        await call("present()");
        await sleep(Math.max(settle, 5000));
        window = audienceWindow(app.pid!) ?? window;
      }
      written.push(file);
      console.log(file);
    }
  }
  console.log(JSON.stringify({ deck, pid: app.pid, written: written.length, runtimeErrors: [...errors] }));
  if (errors.size) process.exitCode = 1;
  control.close();
} finally {
  await cleanup();
}
