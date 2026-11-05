import path from "node:path";

export const renderUsage = `Usage: bun run slides render <deck.mdx> [options]
  --slide N / --slides LIST  One-based slides, e.g. 10-14 or 2,5-7 (default all)
  --steps all|LIST           One-based build states, initial state is 1 (default all)
  --out DIR                 PNG still per selected state (default ./rendered)
  --video FILE.mp4          H.264 video of the selected states
  --fps N                   Fixed frame rate (default 60)
  --step-seconds S          Duration of each state (default 3, rounded to frames)
  --width N --height N      Output pixels (default deck size, or 1920×1080)
  --slide-references        Include slide reference labels (default off)
  --chrome PATH             Chromium executable (or CHROME_PATH)
  --ffmpeg PATH             Encoder executable (default ffmpeg)

Stills sample the last frame of each state. Video includes every fixed-timestep
frame, without audio. Requires Bun and a WebGPU-capable Chromium; video needs ffmpeg.
Uses the existing web player offscreen: no native app, Metro, or screen capture.`;

export function parseRenderArgs(args: string[]) {
  const [deck, ...rest] = args;
  if (!deck || deck.startsWith("--") || !deck.endsWith(".mdx")) throw new Error("Pass a .mdx deck first.");
  const values = new Map<string, string>();
  const allowed = new Set(["--slide", "--slides", "--steps", "--out", "--video", "--fps", "--step-seconds", "--width", "--height", "--chrome", "--ffmpeg"]);
  let slideReferences = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--slide-references") {
      if (slideReferences) throw new Error("Repeated option --slide-references");
      slideReferences = true;
      continue;
    }
    if (!allowed.has(rest[i]) || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error(`Invalid option ${rest[i]}`);
    if (values.has(rest[i])) throw new Error(`Repeated option ${rest[i]}`);
    values.set(rest[i], rest[i + 1]);
    i++;
  }
  if (values.has("--slide") && values.has("--slides")) throw new Error("Use --slide or --slides.");
  if (values.has("--out") && values.has("--video")) throw new Error("Use --out or --video.");
  const positive = (key: string, fallback?: number, integer = true) => {
    const value = values.has(key) ? Number(values.get(key)) : fallback;
    if (value !== undefined && (!(value > 0) || !Number.isFinite(value) || integer && !Number.isInteger(value))) throw new Error(`${key} must be a positive ${integer ? "integer" : "number"}.`);
    return value;
  };
  const fps = positive("--fps", 60)!;
  const seconds = positive("--step-seconds", 3, false)!;
  return { slideReferences, deck: path.resolve(deck), slides: values.get("--slide") ?? values.get("--slides") ?? "all", steps: values.get("--steps") ?? "all",
    out: path.resolve(values.get("--out") ?? "rendered"), video: values.get("--video") && path.resolve(values.get("--video")!),
    fps, framesPerStep: Math.max(1, Math.round(seconds * fps)), width: positive("--width"), height: positive("--height"),
    chrome: values.get("--chrome"), ffmpeg: values.get("--ffmpeg") ?? "ffmpeg" };
}

export function selectRenderItems(list: string, count: number) {
  if (list === "all") return Array.from({ length: count }, (_, i) => i);
  const selected = new Set<number>();
  for (const part of list.split(",")) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid selection: ${list}`);
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (first < 1 || last < first || last > count) throw new Error(`Selection ${part} is outside 1-${count}.`);
    for (let item = first; item <= last; item++) selected.add(item - 1);
  }
  return [...selected].sort((a, b) => a - b);
}
