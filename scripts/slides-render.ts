#!/usr/bin/env bun
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { exportWebsite } from "../packages/slides-web/export";
import { installRenderClock } from "./lib/slidesRenderClock";
import { parseRenderArgs, renderUsage, selectRenderItems } from "./lib/slidesRender";

async function connect(url: string) {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => { socket.onopen = () => resolve(); socket.onerror = reject; });
  let id = 0;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  socket.onclose = () => { for (const request of pending.values()) request.reject(new Error("Chromium disconnected")); pending.clear(); };
  const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
    const key = ++id;
    const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timed out`)); }, 60_000);
    pending.set(key, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async (expression: string) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, evaluate, close: () => socket.close() };
}

export async function renderSlides(args: string[]) {
  const options = parseRenderArgs(args);
  const started = performance.now();
  const chrome = options.chrome ?? process.env.CHROME_PATH ?? (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "chromium");
  if (!Bun.which(chrome)) throw new Error("Chromium not found. Pass --chrome PATH or set CHROME_PATH.");
  if (options.video && !Bun.which(options.ffmpeg)) throw new Error("ffmpeg not found. Pass --ffmpeg PATH.");
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "slides-render-")));
  const website = path.join(temporary, "player");
  let browser: ReturnType<typeof Bun.spawn> | undefined;
  let encoder: ReturnType<typeof Bun.spawn> | undefined;
  let protocol: Awaited<ReturnType<typeof connect>> | undefined;
  let interrupted = false;
  const stop = () => { browser?.kill(); encoder?.kill(); };
  const interrupt = () => { interrupted = true; stop(); };
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
  try {
    await exportWebsite(options.deck, website, { offscreen: true });
    if (interrupted) throw new Error("Render interrupted");
    const manifest = JSON.parse(await fs.readFile(path.join(website, "export.json"), "utf8"));
    const unsupported = Object.values(manifest.effects).some((pack: any) => Object.values(pack).includes("unsupported"));
    if (unsupported) throw new Error(`Unsupported effects:\n${manifest.warnings.join("\n")}`);
    for (const warning of manifest.warnings) console.warn(warning);
    const profile = path.join(temporary, "chrome");
    const log = await fs.open(path.join(temporary, "chrome.log"), "w");
    browser = Bun.spawn([chrome, "--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--enable-unsafe-webgpu", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdout: log.fd, stderr: log.fd });
    await log.close();
    const deadline = Date.now() + 30_000;
    let port: string | undefined;
    while (!port) {
      if (browser.exitCode !== null || Date.now() > deadline) throw new Error(`Chromium did not start:\n${await fs.readFile(path.join(temporary, "chrome.log"), "utf8")}`);
      port = await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8").then(value => value.split("\n")[0], () => undefined);
      if (!port) await Bun.sleep(25);
    }
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json()) as { type: string; webSocketDebuggerUrl: string }[];
    protocol = await connect(targets.find(target => target.type === "page")!.webSocketDebuggerUrl);
    const { send, evaluate } = protocol;
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: options.width ?? 1920, height: options.height ?? 1080, deviceScaleFactor: 1, mobile: false });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `(${installRenderClock.toString()})();` });
    await send("Page.navigate", { url: pathToFileURL(path.join(website, "index.html")).href + `?slide-references=${options.slideReferences}` });
    const tick = (time: number) => evaluate(`globalThis.__slidesRenderClock.tick(${time})`);
    let time = 0, tickIndex = 0;
    async function ready() {
      const deadline = Date.now() + 60_000;
      let stable = 0;
      while (stable < 4) {
        const initialized = await evaluate(`!!globalThis.__legendSlides && !!globalThis.__slidesRenderClock`);
        if (initialized) {
          await evaluate("globalThis.__slidesRenderClock.running=false");
          await tick(time);
          const status = await evaluate(`(() => {
            const p=globalThis.__legendSlides,s=p.getState(),g=globalThis.__slidesRenderClock.status;
            if(p.errors.length || s.runtimeErrors.length) throw Error([...p.errors,...s.runtimeErrors].join("\\n"));
            return s.slides.length>0 && !g.pending && [...document.images].every(i=>i.complete && i.naturalWidth>0)
              && [...document.querySelectorAll('canvas[id^="rnwgpu"]')].every(c=>c.width>0 && c.height>0) && (!document.querySelector('canvas[id^="rnwgpu"]') || g.submissions>0);
          })()`);
          stable = status ? stable + 1 : 0;
        }
        if (Date.now() > deadline) throw new Error("Player preparation timed out");
        await Bun.sleep(25);
      }
      await evaluate("document.fonts.ready");
      await evaluate("globalThis.__slidesRenderClock.running=true");
    }
    await ready();
    if (!await evaluate("!!navigator.gpu")) throw new Error("WebGPU is unavailable in Chromium.");
    const config = await evaluate("globalThis.__legendSlides.getState().config");
    const width = options.width ?? Math.round(config.width ?? 1920);
    const aspect = (config.aspectRatio ?? "16:9").split(/[/:]/).map(Number);
    const height = options.height ?? Math.round(config.height ?? (config.width ?? 1920) * aspect[1] / aspect[0]);
    if (options.video && (width % 2 || height % 2)) throw new Error("MP4 width and height must be even.");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(() => {const style=document.createElement('style');style.textContent='nav,.notes-sidebar,output{display:none!important}';document.head.append(style);})()`);
    await ready();
    const counts: number[] = await evaluate("globalThis.__legendSlides.getState().slides.map(s=>s.metadata.steps??1)");
    const slides = selectRenderItems(options.slides, counts.length);
    const selections = slides.map(slide => ({ slide, steps: selectRenderItems(options.steps, counts[slide]) }));
    let frames = 0, stills = 0;
    const written: string[] = [];
    const screenshot = async () => {
      const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
      return Buffer.from(result.data, "base64");
    };
    const encodeStarted = performance.now();
    if (options.video) {
      await fs.mkdir(path.dirname(options.video), { recursive: true });
      encoder = Bun.spawn([options.ffmpeg, "-hide_banner", "-loglevel", "error", "-n", "-f", "image2pipe", "-framerate", String(options.fps), "-vcodec", "png", "-i", "pipe:0", "-an", "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", options.video], { stdin: "pipe", stdout: "ignore", stderr: "pipe" });
    } else await fs.mkdir(options.out, { recursive: true });
    for (const { slide, steps } of selections) {
      // Replay preceding states too: retained Journey tracks and particle simulations need their history.
      await evaluate(`globalThis.__legendSlides.goTo(${slide},0)`);
      await ready();
      for (let step = 0; step <= steps.at(-1)!; step++) {
        if (step) { await evaluate(`globalThis.__legendSlides.goTo(${slide},${step})`); await ready(); }
        const selected = steps.includes(step);
        for (let frame = 0; frame < options.framesPerStep; frame++) {
          if (frame) time = ++tickIndex * 1000 / options.fps;
          await tick(time);
          if (selected && (options.video || frame === options.framesPerStep - 1)) {
            const png = await screenshot();
            if (encoder) { encoder.stdin!.write(png); await encoder.stdin!.flush(); frames++; }
            else {
              const file = path.join(options.out, `slide-${String(slide + 1).padStart(2, "0")}-step-${step + 1}.png`);
              await fs.writeFile(file, png, { flag: "wx" }); written.push(file); stills++;
            }
          }
        }
        time = ++tickIndex * 1000 / options.fps;
      }
    }
    await evaluate(`(() => {const p=globalThis.__legendSlides;const errors=[...p.errors,...p.getState().runtimeErrors];if(errors.length)throw Error(errors.join("\\n"));})()`);
    if (encoder) {
      encoder.stdin!.end();
      const stderr = await new Response(encoder.stderr).text();
      if (await encoder.exited !== 0) throw new Error(`ffmpeg failed: ${stderr}`);
      written.push(options.video!);
    }
    const renderSeconds = (performance.now() - encodeStarted) / 1000;
    const playerHash = createHash("sha256").update(await fs.readFile(path.join(website, "player.js"))).digest("hex");
    const environment = await evaluate("({browser:navigator.userAgent, gpu:globalThis.__slidesRenderClock.status, viewport:[innerWidth,innerHeight], devicePixelRatio})");
    const result = { written, width, height, fps: options.fps, frames, stills, framesPerStep: options.framesPerStep,
      renderSeconds, framesPerSecond: (frames || selections.reduce((sum, item) => sum + (item.steps.at(-1)! + 1) * options.framesPerStep, 0)) / renderSeconds,
      totalSeconds: (performance.now() - started) / 1000, backend: "headless-chromium-webgpu", clock: "fixed-timestep", playerHash, environment };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    protocol?.close(); stop();
    await Promise.all([browser?.exited, encoder?.exited]);
    process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  if (process.argv.includes("--help")) console.log(renderUsage);
  else await renderSlides(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
