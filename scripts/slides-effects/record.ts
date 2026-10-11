#!/usr/bin/env bun
// Record a gallery preview (mp4 + png poster) of one effect's example deck running in the native Slides app.
// macOS only. Uses the workspace app-lock for "slides" when available. Never deploys.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertPreviewHashes, assertRecorderSucceeded, audienceCropTop, audienceKeyboardScripts, audienceTarget, exampleStepPresses, observeRecorder, packArchiveHash, presenterWindowTitle, recordingDeckSource, recordingExportArgs, recordingMotionCrop, recordingMotionIntervals, recordingSchedule, sha256, snapshotEffectPacks, type RecordingWindow } from "./recording";

const usage = `Usage: bun run effects:record <slug> [options]

Opens packages/slides-effects/examples/<slug>/example.mdx in Legend Slides, records the
slide window with ScreenCaptureKit (video-recording skill recorder), advances --steps
reveals with the right arrow, quits the app it launched, then exports an H.264
mp4 and a PNG poster into legend-docs/docs/public/slides/effects/previews/<slug>/.

  --seconds N        recording length (default: catalog profile or 8)
  --motion START:END expected motion in effect playback seconds (repeatable; default: catalog profile or brief entry/reveal intervals)
  --steps N          right-arrow presses after the lead-in (default: literal <Step>/<Steps count={n}> states)
  --release          launch the release build (default: dev build; start Metro with bun run slides first)
  --window REGEX     audience window title filter (never selects presenter chrome)
  --crop-top PX      pixels to drop from the top of the capture (default 0)
  --width PX         export width (default 1280)
  --docs PATH        legend-docs checkout (default ../legend-docs)
  --apply            write the preview into legend-docs' catalog.json (refresh keeps it while hashes match)
  --preflight        only check recorder permission, display, disk and app build; record nothing
  --reserve-bytes N  free-space floor for the recorder (default 50000000000)

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
const appLock = process.env.LEGEND_APP_LOCK ?? path.join(os.homedir(), "devroot/scripts/app-lock");
// Hold the shared slides lock for the whole run, unless a caller already does.
if (!process.env.LEGEND_EFFECTS_RECORD_LOCKED && appLock && fs.existsSync(appLock) && !flag("--preflight")) {
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
const localEffect = JSON.parse(fs.readFileSync(path.join(sources, "catalog.json"), "utf8")).effects.find((entry: { slug: string }) => entry.slug === slug);
if (!localEffect) throw new Error(`No local catalog entry for ${slug}.`);
const profile = localEffect.recording;
const seconds = Number(option("--seconds") ?? profile?.seconds ?? 8);
const steps = Number(option("--steps") ?? exampleStepPresses(exampleSource));
const cropTop = Number(option("--crop-top") ?? 0);
const width = Number(option("--width") ?? 1280);
const reserve = option("--reserve-bytes") ?? "50000000000";
const release = flag("--release");
const reserveBytes = Number(reserve);
if (!Number.isSafeInteger(reserveBytes) || reserveBytes < 1) throw new Error("--reserve-bytes must be a positive integer.");
function checkDisk(directory: string) {
  const disk = fs.statfsSync(directory);
  const available = disk.bavail * disk.bsize;
  if (available <= reserveBytes) throw new Error(`${directory} has ${available} bytes available; recording needs more than the ${reserveBytes}-byte reserve.`);
}
checkDisk("/System/Volumes/Data");
checkDisk(os.tmpdir());
const schedule = recordingSchedule(seconds, steps);
const explicitMotion = args.flatMap((value, index) => value === "--motion" ? [args[index + 1] ?? ""] : []);
let motion = recordingMotionIntervals(seconds, schedule, explicitMotion.length ? explicitMotion : profile?.motion);
if (!Number.isSafeInteger(cropTop) || cropTop < 0) throw new Error("--crop-top must be a nonnegative integer.");
if (!Number.isSafeInteger(width) || width < 320 || width > 3840 || width % 2) throw new Error("--width must be an even integer between 320 and 3840.");
const run = (command: string, commandArgs: string[], options: { allowFail?: boolean } = {}) => {
  const result = spawnSync(command, commandArgs, { encoding: "utf8" });
  if (result.status !== 0 && !options.allowFail) throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Recorder: the video-recording skill's ScreenCaptureKit window recorder, compiled once.
const skill = process.env.LEGEND_VIDEO_RECORDING_SKILL;
if (!skill) throw new Error("Set LEGEND_VIDEO_RECORDING_SKILL to the video-recording skill directory (scripts/record-macos.swift and scripts/verify-video.py).");
const recorderSource = path.join(skill, "scripts/record-macos.swift");
const verifier = path.join(skill, "scripts/verify-video.py");
if (!fs.existsSync(verifier)) throw new Error(`Video verifier not found: ${verifier}`);
if (run("python3", ["--version"], { allowFail: true }).status !== 0) throw new Error("python3 is required for video verification.");
const scratch = path.join(os.tmpdir(), "legend-slides-effects-recorder");
const recorder = process.env.LEGEND_RECORD_MACOS ?? path.join(scratch, "record-macos");
if (!fs.existsSync(recorder)) {
  if (!fs.existsSync(recorderSource)) throw new Error(`Recorder not found at ${recorderSource}. Set LEGEND_VIDEO_RECORDING_SKILL or LEGEND_RECORD_MACOS.`);
  fs.mkdirSync(scratch, { recursive: true });
  console.log("Compiling the ScreenCaptureKit recorder…");
  run("xcrun", ["swiftc", "-O", recorderSource, "-o", recorder]);
}
function listWindows(): RecordingWindow[] {
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
checkDisk(docs);
const catalogFile = path.join(docs, "docs/public/slides/effects/catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
const effect = catalog.effects.find((entry: { slug: string }) => entry.slug === slug);
const pack = effect && catalog.packs[effect.pack];
const hashes = { exampleSha256: sha256(exampleSource), packSha256: packArchiveHash(path.join(sources, "packs", localEffect.pack)) };
if (flag("--apply")) {
  if (!effect || !pack || effect.pack !== localEffect.pack) throw new Error("Effect is missing or has a different pack in legend-docs; refresh its catalog before --apply.");
  assertPreviewHashes(hashes, { exampleSha256: effect.example.sha256, packSha256: pack.versions[pack.latest].sha256 });
}
if (flag("--preflight")) { console.log(JSON.stringify({ ok: true, recorder, app: appPath, example, previews, steps, seconds })); process.exit(0); }
if (running()) throw new Error("Legend Slides is already running. Save and quit it first; this script only quits the instance it launches.");

const work = fs.mkdtempSync(path.join(os.tmpdir(), `slides-effect-${slug}-`));
const deck = path.join(work, `${slug}.mdx`);
const capturePacks = path.join(work, "packs");
snapshotEffectPacks(path.join(sources, "packs"), capturePacks, localEffect.pack, hashes.packSha256);
fs.writeFileSync(deck, recordingDeckSource(exampleSource));
const raw = path.join(work, "raw.mp4");
let playbackOffset = 0;
const actualSchedule: number[] = [];
let automaticCrop = 0;
let presenterTitle: string | undefined;
let presenterPid: number | undefined;
let recording: ChildProcess | undefined;
let recorderEvents: ReturnType<typeof observeRecorder> | undefined;
try {
  console.log(`Opening ${slug} in ${path.basename(appPath)}…`);
  // Launch directly so the app inherits a PATH containing bun: dev builds spawn the deck compiler with it.
  const env = [`PATH=${path.dirname(process.execPath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`, `LEGEND_SLIDES_EFFECT_PACKS=${capturePacks}`];
  const devArgs: string[] = [];
  if (!release) {
    const { resolveDevServerPort } = await import(path.join(repo, "scripts/lib/apps.ts"));
    const port = resolveDevServerPort("slides", []);
    env.push(`SPARK_BUNDLE_URL=http://127.0.0.1:${port}/index.bundle?platform=macos&dev=true&minify=false`);
    devArgs.push("-RCT_jsLocation", `127.0.0.1:${port}`);
  }
  run("open", ["-n", ...env.flatMap(value => ["--env", value]), appPath, "--args", ...devArgs, deck]);
  let deckWindow: RecordingWindow | undefined;
  const pattern = option("--window") ? new RegExp(option("--window")!, "i") : undefined;
  presenterTitle = presenterWindowTitle(slug);
  for (let attempt = 0; attempt < 60 && !deckWindow; attempt++) {
    await sleep(1000);
    deckWindow = listWindows().find(w => w.owner === "Legend Slides" && w.title === presenterTitle && w.width > 200 && w.height > 200);
  }
  if (!deckWindow) throw new Error(`The deck window did not appear within 60 s. Slides windows: ${JSON.stringify(listWindows().filter(window => window.owner === "Legend Slides"))}. Check compilation and Metro logs.`);
  presenterPid = deckWindow.pid;
  // Scope the toolbar action to this deck and wait until compilation enables Start.
  const startAudience = `tell application "System Events"
    tell (first application process whose unix id is ${deckWindow.pid})
      tell toolbar 1 of window ${JSON.stringify(presenterTitle)}
        set startButton to first UI element whose description is "Start Presentation" or description is "Start Rehearsal"
        if enabled of startButton then
          click startButton
          return "started"
        end if
      end tell
    end tell
  end tell`;
  let started = false;
  for (let attempt = 0; attempt < 60 && !started; attempt++) {
    started = run("osascript", ["-e", startAudience], { allowFail: true }).stdout.trim() === "started";
    if (!started) await sleep(1000);
  }
  if (!started) throw new Error("The deck's Start button was not enabled within 60 s; check compilation and Accessibility permission.");
  let target: RecordingWindow | undefined;
  for (let attempt = 0; attempt < 20 && !target; attempt++) {
    await sleep(1000);
    target = audienceTarget(listWindows(), deckWindow.pid, pattern);
  }
  if (!target) throw new Error("The Legend Slides audience window did not appear within 20 s after starting the presentation.");
  const keyboard = audienceKeyboardScripts(target.pid, target.title);
  // Focus before capture begins; raising a window during recording can invalidate its ScreenCaptureKit stream.
  run("osascript", ["-e", keyboard.activate]);
  target = audienceTarget(listWindows(), deckWindow.pid, pattern);
  if (!target) throw new Error("The Legend Slides audience window disappeared while preparing recording focus.");
  // Windowed audiences include a title bar; recorder window dimensions are in points.
  const audienceProcess = `tell application "System Events" to tell (first application process whose unix id is ${target.pid})`;
  const audienceWindow = `window ${JSON.stringify(target.title)}`;
  const fullscreen = run("osascript", ["-e", `${audienceProcess} to get value of attribute "AXFullScreen" of ${audienceWindow}`]).stdout.trim() === "true";
  automaticCrop = audienceCropTop(fullscreen, 1920, target.width);
  console.log(`Recording audience window ${target.id} "${target.title}" for ${seconds}s, ${steps} step(s)…`);
  recording = spawn(recorder, ["--window-id", String(target.id), "--output", raw, "--seconds", String(seconds + 5), "--fps", "60", "--width", "1920", "--reserve-bytes", reserve], { stdio: ["ignore", "pipe", "inherit"] });
  recorderEvents = observeRecorder(recording);
  const readyOffset = await recorderEvents.started;
  const readyAt = performance.now();
  const exitedEarly = recorderEvents.exited.then(result => { throw result.error ?? new Error(`Recorder exited (${result.code ?? result.signal}) before navigation finished.`); });
  void exitedEarly.catch(() => {});
  // Leave the blank lead-in only once native capture is producing frames.
  const advanceAudience = keyboard.advance;
  run("osascript", ["-e", advanceAudience]);
  const startedAt = performance.now();
  const navigationSeconds = (startedAt - readyAt) / 1000;
  playbackOffset = readyOffset + navigationSeconds;
  if (playbackOffset >= 5) throw new Error("Playback navigation exceeded the recorder's five-second lead-in budget.");
  for (const offset of schedule) {
    await Promise.race([sleep(Math.max(0, offset - (performance.now() - startedAt))), exitedEarly]);
    // Keep the already-focused audience active without raising it during the capture.
    run("osascript", ["-e", advanceAudience]);
    actualSchedule.push(performance.now() - startedAt);
  }
  if (!explicitMotion.length && !profile?.motion?.length) motion = recordingMotionIntervals(seconds, actualSchedule);
  const result = await recorderEvents.exited;
  if (result.code !== 0 && fs.existsSync(`${raw}.capture.json`)) console.error(fs.readFileSync(`${raw}.capture.json`, "utf8"));
  assertRecorderSucceeded(result);
} catch (error) {
  console.error(`Recording failed; local artifacts are in ${work} (raw capture: ${raw}).`);
  throw error;
} finally {
  if (recording && recorderEvents && recording.exitCode === null && recording.signalCode === null) {
    recording.kill("SIGINT");
    const deadline = setTimeout(() => recording!.kill("SIGKILL"), 15_000);
    await recorderEvents.exited;
    clearTimeout(deadline);
  }
  if (presenterPid && presenterTitle) {
    const stop = `tell application "System Events" to tell (first application process whose unix id is ${presenterPid}) to click (first UI element of toolbar 1 of window ${JSON.stringify(presenterTitle)} whose description is "Stop")`;
    run("osascript", ["-e", stop], { allowFail: true });
  }
  await sleep(1000);
  if (presenterPid) run("kill", ["-TERM", String(presenterPid)], { allowFail: true });
  await sleep(2000);
  // Only the instance opened with this run's temporary deck; never another Slides session.
  run("pkill", ["-f", work], { allowFail: true });
}
if (!fs.existsSync(raw)) throw new Error("The recorder produced no video.");

// Export: apply any explicit crop, scale, H.264 without audio; poster from the last second.
const video = path.join(work, "preview.mp4"), poster = path.join(work, "poster.png");
const totalCropTop = cropTop + automaticCrop;
run("ffmpeg", recordingExportArgs(raw, video, playbackOffset, seconds, totalCropTop, width));
run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-sseof", "-1", "-i", video, "-frames:v", "1", poster]);
const report = path.join(work, "quality.json");
const dimensions = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", video]).stdout).streams[0];
const check = run("python3", [verifier, video, ...motion.flatMap(interval => ["--motion", interval]), ...recordingMotionCrop(slug, dimensions.width, dimensions.height), ...(profile?.noiseDb === undefined ? [] : ["--noise-db", String(profile.noiseDb)]), ...(profile?.freezeMs === undefined ? [] : ["--freeze-ms", String(profile.freezeMs)]), "--timings", `${raw}.frames.jsonl`, "--timing-offset", String(playbackOffset), "--report", report], { allowFail: true });
const passed = check.status === 0;

if (!passed) {
  console.log(JSON.stringify({ slug, passed, quality: report, raw, video, poster, applied: false }, null, 2));
  console.warn(`Motion check failed; nothing was published. Local artifacts: ${video}, ${poster}, ${report}.`);
  process.exitCode = 1;
} else {
  // Recheck immediately before writing in case the catalog or checkout changed during capture.
  const currentCatalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
  const currentEffect = currentCatalog.effects.find((entry: { slug: string }) => entry.slug === slug);
  if (flag("--apply")) {
    const currentPack = currentEffect && currentCatalog.packs[currentEffect.pack];
    if (!currentEffect || !currentPack || currentEffect.pack !== localEffect.pack) throw new Error("Published effect changed during recording; refresh and record again.");
    assertPreviewHashes(hashes, { exampleSha256: currentEffect.example.sha256, packSha256: currentPack.versions[currentPack.latest].sha256 });
    assertPreviewHashes(hashes, { exampleSha256: sha256(fs.readFileSync(example)), packSha256: packArchiveHash(path.join(sources, "packs", localEffect.pack)) });
  }
  const posterName = `${sha256(fs.readFileSync(poster))}.png`, videoName = `${sha256(fs.readFileSync(video))}.mp4`;
  const preview = {
    poster: `/slides/effects/previews/${slug}/${posterName}`,
    video: `/slides/effects/previews/${slug}/${videoName}`,
    renderer: `Legend Slides for macOS (${release ? "release" : "development"} build)`,
    ...hashes,
  };
  fs.mkdirSync(previews, { recursive: true });
  fs.copyFileSync(poster, path.join(previews, posterName));
  fs.copyFileSync(video, path.join(previews, videoName));
  if (flag("--apply")) {
    currentEffect.preview = preview;
    fs.writeFileSync(catalogFile, JSON.stringify(currentCatalog, null, 2) + "\n");
  }
  console.log(JSON.stringify({ slug, passed, quality: report, raw, video, poster, previews, preview, applied: flag("--apply") }, null, 2));
}
