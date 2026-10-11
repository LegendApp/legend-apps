#!/usr/bin/env bun
// Record a gallery preview (mp4 + png poster) of one effect's example deck running in the native Slides app.
// macOS only. Runs under the devroot app-lock for "slides". Never deploys.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const usage = `Usage: bun run effects:record <slug> [options]

Opens packages/slides-effects/examples/<slug>/example.mdx in Legend Slides, records the
slide window with ScreenCaptureKit (video-recording skill recorder), advances --steps
reveals with the right arrow, quits the app it launched, then exports a cropped H.264
mp4 and a PNG poster into legend-docs/docs/public/slides/effects/previews/<slug>/.

  --seconds N        recording length (default 8)
  --steps N          right-arrow presses after the lead-in (default: <Step> count in the example)
  --release          launch the release build (default: dev build; start Metro with bun run slides first)
  --window REGEX     window title to record (default: Legend Slides — Audience)
  --crop-top PX      pixels to drop from the top of the capture (default 0)
  --width PX         export width (default 1280)
  --docs PATH        legend-docs checkout (default ../legend-docs)
  --apply            write the preview into legend-docs' catalog.json (refresh keeps it while hashes match)
  --preflight        only check recorder permission, display, disk and app build; record nothing
  --reserve-bytes N  free-space floor for the recorder (default 30000000000)

Needs Screen Recording permission for the host running this script (a Terminal or tmux
started from one; plain ssh has none) and Accessibility permission to send arrow keys.`;

const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) { console.log(usage); process.exit(args.length ? 0 : 2); }
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name: string) => args.includes(name);
const slug = args[0];
if (!/^[a-z][a-z0-9-]*$/.test(slug)) throw new Error("Pass an effect slug first, e.g. droplets.");
if (process.platform !== "darwin") throw new Error("effects:record runs on macOS only.");

const repo = path.resolve(import.meta.dirname, "../..");
const devroot = path.resolve(repo, "../../..");
const appLock = path.join(devroot, "scripts/app-lock");
// Hold the shared slides lock for the whole run, unless a caller already does.
if (!process.env.LEGEND_EFFECTS_RECORD_LOCKED && fs.existsSync(appLock) && !flag("--preflight")) {
  const result = spawnSync(appLock, ["slides", "--", process.execPath, import.meta.filename, ...args], {
    stdio: "inherit", env: { ...process.env, LEGEND_EFFECTS_RECORD_LOCKED: "1" } });
  process.exit(result.status ?? 1);
}

const sources = path.join(repo, "packages/slides-effects");
const example = path.join(sources, "examples", slug, "example.mdx");
if (!fs.existsSync(example)) throw new Error(`No example deck for "${slug}" (${example}). Create it with bun run effects:add.`);
const exampleSource = fs.readFileSync(example, "utf8");
const docs = path.resolve(option("--docs") ?? path.join(repo, "../legend-docs"));
const previews = path.join(docs, "docs/public/slides/effects/previews", slug);
const seconds = Number(option("--seconds") ?? 8);
const steps = Number(option("--steps") ?? (exampleSource.match(/<Step\b/g) ?? []).length);
const cropTop = Number(option("--crop-top") ?? 0);
const width = Number(option("--width") ?? 1280);
const reserve = option("--reserve-bytes") ?? "30000000000";
const release = flag("--release");
const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const run = (command: string, commandArgs: string[], options: { allowFail?: boolean } = {}) => {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  if (result.status !== 0 && !options.allowFail) throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Recorder: the video-recording skill's ScreenCaptureKit window recorder, compiled once.
const skill = process.env.LEGEND_VIDEO_RECORDING_SKILL ?? path.join(os.homedir(), ".claude/skills/video-recording");
const recorderSource = path.join(skill, "scripts/record-macos.swift");
const verifier = path.join(skill, "scripts/verify-video.py");
const scratch = path.join(devroot, "scratch/effects-record");
fs.mkdirSync(scratch, { recursive: true });
let recorder = process.env.LEGEND_RECORD_MACOS ?? path.join(scratch, "record-macos");
if (!fs.existsSync(recorder)) {
  if (!fs.existsSync(recorderSource)) throw new Error(`Recorder not found. Install the video-recording skill or set LEGEND_RECORD_MACOS. Looked in ${recorderSource}.`);
  console.log("Compiling the ScreenCaptureKit recorder…");
  run("xcrun", ["swiftc", "-O", recorderSource, "-o", recorder]);
}
type Window = { id: number; title: string; owner: string; pid: number; width: number; height: number };
function listWindows(): Window[] {
  const result = run(recorder, ["--list"], { allowFail: true });
  const lines = `${result.stdout}\n${result.stderr}`.trim().split("\n").filter(line => line.startsWith("{"));
  const message = JSON.parse(lines.pop() || '{"type":"error","message":"no output from recorder --list"}');
  if (message.type === "error") throw new Error(`Recorder: ${message.message}`);
  return message.windows ?? [];
}

const buildRecord = path.join(repo, `shell/.legend/spark/slides/.spark/${release ? "release" : "dev"}-build.json`);
const appPath = fs.existsSync(buildRecord) ? JSON.parse(fs.readFileSync(buildRecord, "utf8")).app as string : undefined;
const running = () => run("pgrep", ["-f", "LegendSlides.app/Contents/MacOS/"], { allowFail: true }).stdout.trim();

// Preflight: everything that can fail before touching the app.
listWindows();
if (!appPath || !fs.existsSync(appPath)) throw new Error(`No ${release ? "release" : "dev"} Slides build. Run: bun run slides build macos${release ? "" : " --dev"}`);
if (!run("which", ["ffmpeg"], { allowFail: true }).stdout.trim()) throw new Error("ffmpeg is required (brew install ffmpeg).");
if (!fs.existsSync(path.join(docs, "docs/public/slides/effects/catalog.json"))) throw new Error(`legend-docs gallery not found at ${docs}. Pass --docs.`);
if (flag("--preflight")) { console.log(JSON.stringify({ ok: true, recorder, app: appPath, example, previews, steps, seconds })); process.exit(0); }
if (running()) throw new Error("Legend Slides is already running. Save and quit it first; this script only quits the instance it launches.");

const work = fs.mkdtempSync(path.join(os.tmpdir(), `slides-effect-${slug}-`));
const deck = path.join(work, `${slug}.mdx`);
fs.writeFileSync(deck, exampleSource);
const raw = path.join(work, "raw.mp4");
let recording: ChildProcess | undefined;
try {
  console.log(`Opening ${slug} in ${path.basename(appPath)}…`);
  // Launch directly so the app inherits a PATH containing bun: dev builds spawn the deck compiler with it.
  const env = [`PATH=${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`];
  const devArgs: string[] = [];
  if (!release) {
    const { resolveDevServerPort } = await import(path.join(repo, "scripts/lib/apps.ts"));
    const port = resolveDevServerPort("slides", []);
    env.push(`SPARK_BUNDLE_URL=http://127.0.0.1:${port}/index.bundle?platform=macos&dev=true&minify=false`);
    devArgs.push("-RCT_jsLocation", `127.0.0.1:${port}`);
  }
  run("open", ["-n", ...env.flatMap(value => ["--env", value]), appPath, "--args", ...devArgs, deck]);
  let deckWindow: Window | undefined;
  const pattern = option("--window") ? new RegExp(option("--window")!, "i") : undefined;
  for (let attempt = 0; attempt < 60 && !deckWindow; attempt++) {
    await sleep(1000);
    deckWindow = listWindows().find(w => w.owner === "Legend Slides" && w.title === `${slug}.mdx — Legend Slides` && w.width > 200 && w.height > 200);
  }
  if (!deckWindow) throw new Error("The deck window did not appear within 60 s. Check that the deck compiles and Metro is running for dev builds.");
  await sleep(3000); // Let compilation and preparation settle before the lead-in.
  run("osascript", ["-e", 'tell application "System Events" to tell process "LegendSlides" to click (first UI element of toolbar 1 of window 1 whose description is "Start Presentation")']);
  let target: Window | undefined;
  for (let attempt = 0; attempt < 20 && !target; attempt++) {
    await sleep(1000);
    const windows = listWindows().filter(w => w.owner === "Legend Slides" && w.width > 200 && w.height > 200);
    target = pattern ? windows.find(w => pattern.test(w.title))
      : windows.find(w => w.title === "Legend Slides — Audience");
  }
  if (!target) throw new Error("The Legend Slides audience window did not appear within 20 s after starting the presentation.");
  console.log(`Recording window ${target.id} "${target.title}" for ${seconds}s, ${steps} step(s)…`);
  recording = spawn(recorder, ["--window-id", String(target.id), "--output", raw, "--seconds", String(seconds), "--fps", "60", "--width", "1920", "--reserve-bytes", reserve], { stdio: ["ignore", "pipe", "inherit"] });
  const ready = new Promise<void>((resolve, reject) => {
    recording!.stdout!.on("data", chunk => { if (String(chunk).includes('"ready"')) resolve(); });
    recording!.on("exit", code => reject(new Error(`Recorder exited (${code}) before ready.`)));
  });
  await ready;
  const lead = 1500, interval = steps ? Math.max(800, (seconds * 1000 - lead - 1500) / steps) : 0;
  await sleep(lead);
  for (let step = 0; step < steps; step++) {
    // Arrow keys go to the frontmost window; this needs Accessibility permission for the host.
    run("osascript", ["-e", 'tell application id "so.legend.slides.macos" to activate', "-e", 'tell application "System Events" to key code 124']);
    await sleep(interval);
  }
  await new Promise(resolve => recording!.on("exit", resolve));
} finally {
  if (recording && recording.exitCode === null) recording.kill("SIGINT");
  run("osascript", ["-e", 'tell application "System Events" to tell process "LegendSlides" to click (first UI element of toolbar 1 of window 1 whose description is "Stop")'], { allowFail: true });
  await sleep(1000);
  run("osascript", ["-e", 'tell application id "so.legend.slides.macos" to quit'], { allowFail: true });
  await sleep(2000);
  // Only the instance opened with this run's temporary deck; never another Slides session.
  run("pkill", ["-f", work], { allowFail: true });
}
if (!fs.existsSync(raw)) throw new Error("The recorder produced no video.");

// Export: crop the title bar, scale, H.264 without audio; poster from the last second.
const video = path.join(work, "preview.mp4"), poster = path.join(work, "poster.png");
const filter = `crop=iw:ih-${cropTop}:0:${cropTop},scale=${width}:-2:flags=lanczos`;
run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", raw, "-vf", filter, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video]);
run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-sseof", "-1", "-i", raw, "-vf", filter, "-frames:v", "1", poster]);
const report = path.join(work, "quality.json");
const check = run("python3", [verifier, video, "--motion", `${1.5}:${Math.max(2, seconds - 0.5)}`, "--timings", `${raw}.frames.jsonl`, "--report", report], { allowFail: true });
const passed = check.status === 0;

fs.mkdirSync(previews, { recursive: true });
const posterBytes = fs.readFileSync(poster), videoBytes = fs.readFileSync(video);
const posterName = `${sha256(posterBytes)}.png`, videoName = `${sha256(videoBytes)}.mp4`;
if (passed) { fs.copyFileSync(poster, path.join(previews, posterName)); fs.copyFileSync(video, path.join(previews, videoName)); }

const catalogFile = path.join(docs, "docs/public/slides/effects/catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
const effect = catalog.effects.find((entry: { slug: string }) => entry.slug === slug);
const pack = effect && catalog.packs[effect.pack];
const preview = effect && pack && {
  poster: `/slides/effects/previews/${slug}/${posterName}`,
  ...(passed ? { video: `/slides/effects/previews/${slug}/${videoName}` } : {}),
  renderer: `Legend Slides for macOS (${release ? "release" : "development"} build)`,
  exampleSha256: effect.example.sha256,
  packSha256: pack.versions[pack.latest].sha256,
};
if (effect && effect.example.sha256 !== sha256(exampleSource)) console.warn("The published example differs from this checkout's example; run the legend-docs refresh first or the preview will be dropped.");
if (flag("--apply") && preview && passed) { effect.preview = preview; fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + "\n"); }
console.log(JSON.stringify({ slug, passed, quality: report, raw, previews, preview: preview ?? "effect not yet in the published catalog; run the legend-docs refresh, then re-run with --apply", applied: flag("--apply") && !!preview && passed }, null, 2));
if (!passed) console.warn(`Motion check failed (see ${report}); kept the poster only. Watch ${video} at normal speed before overriding.`);
