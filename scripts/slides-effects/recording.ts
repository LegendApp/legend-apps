import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const presentationRequire = createRequire(path.resolve(import.meta.dirname, "../../packages/presentation/package.json"));
type MdxNode = { type: string; name?: string; value?: string | { value: string }; attributes?: MdxNode[]; children?: MdxNode[] };
const { createProcessor } = presentationRequire("@mdx-js/mdx") as { createProcessor(options: object): { parse(source: string): MdxNode } };
const frontmatter = presentationRequire("remark-frontmatter").default;

/** Runtime step metadata is discovered by rendering; inspect literal MDX steps without running deck code. */
export function exampleStepPresses(source: string) {
  const tree = createProcessor({ remarkPlugins: [frontmatter] }).parse(source);
  let cursor = 0;
  function literal(node: MdxNode, name: string): number | undefined {
    const attribute = node.attributes?.find(attribute => attribute.name === name);
    if (!attribute) return;
    const value = typeof attribute.value === "object" ? attribute.value.value : attribute.value;
    if (!/^\d+$/.test(value ?? "")) throw new Error(`Nonliteral ${node.name} ${name}; pass --steps explicitly.`);
    return Number(value);
  }
  function visit(node: MdxNode) {
    if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
      if (node.name === "Steps") {
        const count = literal(node, "count");
        if (count === undefined) throw new Error("Steps without a literal count; pass --steps explicitly.");
        if (count < 1) throw new Error("Steps count must include at least the initial state.");
        cursor = Math.max(cursor, count - 1);
      }
      if (node.name === "Step") {
        if (node.attributes?.some(attribute => attribute.name === "states")) throw new Error("Step states need an explicit --steps count.");
        cursor = Math.max(cursor, literal(node, "at") ?? cursor + 1, literal(node, "until") ?? 0);
      }
    }
    node.children?.forEach(visit);
  }
  visit(tree);
  return cursor;
}

export type RecordingWindow = { id: number; title: string; owner: string; pid: number; width: number; height: number };

export function audienceKeyboardScripts(pid: number, title: string) {
  const process = `tell application "System Events" to tell (first application process whose unix id is ${pid})`;
  const window = `window ${JSON.stringify(title)}`;
  return {
    activate: `${process}\n  set frontmost to true\n  perform action "AXRaise" of ${window}\nend tell`,
    advance: `${process}\n  key code 124\nend tell`,
  };
}

export function recordingMotionCrop(slug: string, width: number, height: number) {
  // Slow backgrounds occupy the edges; static text in the center dilutes their frame differences.
  if (slug === "smoke" || slug === "ambientaurora" || slug === "wireframe" || slug === "glassatmosphere") return ["--crop", `0:${Math.round(height * 0.1)}:${Math.round(width * 0.18)}:${Math.round(height * 0.8)}`];
  if (slug === "interactive-glass") return ["--crop", `${Math.round(width * 0.12)}:${Math.round(height * 0.09)}:${Math.round(width * 0.39)}:${Math.round(height * 0.77)}`];
  if (slug === "glass-panels") return ["--crop", `${Math.round(width * 0.22)}:${Math.round(height * 0.38)}:${Math.round(width * 0.24)}:${Math.round(height * 0.34)}`];
  if (slug === "prismatic-tear") return ["--crop", `${Math.round(width * 0.27)}:${Math.round(height * 0.43)}:${Math.round(width * 0.47)}:${Math.round(height * 0.28)}`];
  if (slug === "trajectory-emitter") return ["--crop", `${Math.round(width * 0.23)}:${Math.round(height * 0.4)}:${Math.round(width * 0.43)}:${Math.round(height * 0.49)}`];
  if (slug === "branch-fan") return ["--crop", `${Math.round(width * 0.39)}:${Math.round(height * 0.28)}:${Math.round(width * 0.24)}:${Math.round(height * 0.61)}`];
  if (slug === "freeze-frame") return ["--crop", `${Math.round(width * 0.25)}:${Math.round(height * 0.25)}:${Math.round(width * 0.4)}:${Math.round(height * 0.55)}`];
  if (slug === "bar-row") return ["--crop", `${Math.round(width * 0.22)}:${Math.round(height * 0.4)}:${Math.round(width * 0.62)}:${Math.round(height * 0.12)}`];
  if (slug !== "droplets") return [];
  const x = Math.round(width * 0.22), y = Math.round(height * 0.56);
  const cropWidth = Math.round(width * 0.22), cropHeight = Math.round(height * 0.38);
  return ["--crop", `${x}:${y}:${cropWidth}:${cropHeight}`];
}

export function audienceTarget(windows: RecordingWindow[], pid: number, pattern?: RegExp) {
  return windows.find(window => window.pid === pid && window.title === "Legend Slides — Audience"
    && window.width > 200 && window.height > 200 && (!pattern || pattern.test(window.title)));
}

export const presenterWindowTitle = (slug: string) => `${slug}.mdx — Legend Slides`;

/** Convert the title bar from window points to the recorder's output pixels. */
export function audienceCropTop(fullscreen: boolean, recordedWidth: number, windowPointWidth: number, titleBarPoints = 28) {
  if (fullscreen) return 0;
  return Math.round(titleBarPoints * recordedWidth / windowPointWidth);
}

export function recordingSchedule(seconds: number, steps: number) {
  const lead = 1500, tail = 1500;
  // The recorder's 600-second limit includes the five-second capture lead-in.
  if (!Number.isFinite(seconds) || seconds < 3 || seconds > 595) throw new Error("--seconds must be between 3 and 595.");
  if (!Number.isSafeInteger(steps) || steps < 0) throw new Error("--steps must be a nonnegative integer.");
  const interval = steps ? (seconds * 1000 - lead - tail) / steps : 0;
  if (steps && interval < 800) throw new Error("Step schedule exceeds the recording duration; increase --seconds or reduce --steps.");
  return Array.from({ length: steps }, (_, index) => lead + index * interval);
}

/** Register immediately after spawn so an exit during navigation cannot be missed. */
export function observeRecorder(child: ChildProcess, readyTimeoutMs = 30_000) {
  let output = "";
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>(resolve => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    child.once("error", error => resolve({ code: null, signal: null, error }));
  });
  let timeout: ReturnType<typeof setTimeout>;
  const started = new Promise<number>((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Recorder did not become ready within 30 seconds.")), readyTimeoutMs);
    child.stdout!.on("data", chunk => {
      output += String(chunk);
      const lines = output.split("\n");
      output = lines.pop()!;
      for (const line of lines) {
        if (/"type"\s*:\s*"ready"/.test(line)) {
          const event = JSON.parse(line);
          const offset = event.hostSeconds - event.firstFrameHostSeconds;
          if (!Number.isFinite(offset) || offset < 0) reject(new Error("Recorder ready event lacks valid native timing."));
          else resolve(offset);
        }
      }
    });
    void exited.then(result => {
      reject(result.error ?? new Error(`Recorder exited (${result.code ?? result.signal}) before ready.`));
    });
  }).finally(() => clearTimeout(timeout));
  return { started, exited };
}

export function assertRecorderSucceeded(result: { code: number | null; signal: NodeJS.Signals | null; error?: Error }) {
  if (result.error) throw result.error;
  if (result.code !== 0) throw new Error(`Recorder failed (${result.code ?? result.signal}).`);
}

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** Match the public catalog publisher's sorted, content-addressed pack archive. */
export function packArchiveHash(directory: string) {
  const files: Record<string, string> = {};
  function visit(directory: string, prefix = "") {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name), relative = prefix + entry.name;
      if (entry.isDirectory()) visit(file, relative + "/");
      else if (/\.(tsx?|json)$/.test(file)) files[relative] = fs.readFileSync(file, "utf8");
    }
  }
  visit(directory);
  return sha256(JSON.stringify({ schemaVersion: 1, files }) + "\n");
}

export function assertPreviewHashes(local: { exampleSha256: string; packSha256: string }, published: { exampleSha256: string; packSha256: string }) {
  if (local.exampleSha256 !== published.exampleSha256 || local.packSha256 !== published.packSha256) {
    throw new Error("Example or pack differs from the published catalog; refresh legend-docs before --apply.");
  }
}

/** Keep the first effect slide in preparation until recording is ready. */
export function recordingDeckSource(source: string) {
  const header = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source)?.[0] ?? "";
  return header + "\n<SlideSeparator />\n\n" + source.slice(header.length);
}

/** Release and development compilers must consume the same validated sources. */
export function snapshotEffectPacks(source: string, destination: string, pack: string, expectedHash: string) {
  fs.cpSync(source, destination, { recursive: true });
  if (packArchiveHash(path.join(destination, pack)) !== expectedHash) {
    throw new Error("Effect pack changed while preparing capture; record again.");
  }
}

/** Brief motion after entry/reveals; callers can specify longer effect-specific intervals. */
export function recordingMotionIntervals(seconds: number, schedule: number[], explicit?: string[]) {
  const intervals = explicit?.length ? explicit : (schedule.length ? schedule.map(offset => `${offset / 1000 + 0.1}:${offset / 1000 + 0.5}`) : ["0.6:1"]);
  return intervals.map(value => {
    const parts = value.split(":");
    const [start, end] = parts.map(Number);
    if (parts.length !== 2 || !parts.every(part => part.trim()) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > seconds) {
      throw new Error("--motion must be START:END within the effect's recording duration.");
    }
    return `${start}:${end}`;
  });
}

/** Sparse native recordings must retain each source sample and its presentation timestamp. */
export function recordingExportArgs(raw: string, video: string, offset: number, seconds: number, cropTop: number, width: number) {
  return ["-hide_banner", "-loglevel", "error", "-ss", String(offset), "-i", raw, "-t", String(seconds),
    "-vf", `crop=iw:ih-${cropTop}:0:${cropTop},scale=${width}:-2:flags=lanczos`, "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p",
    "-fps_mode", "passthrough", "-enc_time_base", "demux", "-movflags", "+faststart", video];
}
