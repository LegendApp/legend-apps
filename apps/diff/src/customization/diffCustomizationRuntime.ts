import { createStorage, type Storage } from "@legend-apps/storage";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCommand, resolveCommand, type ProcessTarget } from "@legendapp/spark/processes";
import { closeWindow, listWindows, openWindow } from "@legendapp/spark/windows";
import type { ComponentType } from "react";
import type { DiffViewerWindowProps } from "../DiffViewerWindow";
import { diffCustomizationPreviewWindowIdentifier } from "../appConstants";
import { prepareDiffWindowsForTransition } from "../diffAppExit";
import { createDiffCustomizationController } from "./diffCustomizationController";
import { diffCustomizationHosts } from "./diffCustomizationHosts.generated";
import type { DiffCustomizationBaseline, DiffCustomizationVersion } from "./diffCustomizationModel";
import { createDiffCustomizationPreviewHosts } from "./diffCustomizationPreviewHosts";
import { runDiffCustomizationAI } from "./diffCustomizationAI";

export const diffCustomizationPreviewWindowId = diffCustomizationPreviewWindowIdentifier;
export const diffCustomizationPreviewModuleName = "DiffCustomizationPreview";
let storage: Storage;
function customizationStorage() { return storage ??= createStorage({ subfolder: "customizations" }); }

const components = new Map<string, ComponentType<DiffViewerWindowProps>>();
export function getDiffCustomizationComponent(version: DiffCustomizationVersion | null, preview = false) {
  if (!version?.code) return null;
  const cacheId = `${version.id}:${preview}`;
  const cached = components.get(cacheId);
  if (cached) return cached;
  const module = { exports: {} as { default?: unknown } };
  const hosts = preview ? createDiffCustomizationPreviewHosts(diffCustomizationHosts, getDiffCustomizationSampleSource().value) : diffCustomizationHosts;
  Function("require", "module", "exports", "global", version.code)((name: string) => {
    if (!Object.hasOwn(hosts, name)) throw new Error(`Unavailable customization module: ${name}`);
    return hosts[name];
  }, module, module.exports, globalThis);
  if (typeof module.exports.default !== "function") throw new Error("The customization did not export a Diff viewer.");
  const component = module.exports.default as ComponentType<DiffViewerWindowProps>;
  components.set(cacheId, component);
  if (components.size > 32) components.delete(components.keys().next().value!);
  return component;
}

async function compiler() : Promise<{ target: ProcessTarget; prefix: string[] }> {
  if (!__DEV__) return { target: { type: "helper", name: "diff-customizer" }, prefix: [] };
  const source = process.env.EXPO_PUBLIC_LEGEND_DIFF_CUSTOMIZER_PATH;
  const bun = await resolveCommand("bun");
  if (!source || !bun) throw new Error("Restart Diff with bun run diff run macos to enable the customization compiler.");
  return { target: { type: "executable", path: bun }, prefix: [source] };
}

async function runCompiler(args: string[], input: unknown, signal: AbortSignal) {
  const command = await compiler();
  const result = await runCommand({ target: command.target, args: [...command.prefix, ...args], input: input === undefined ? undefined : JSON.stringify(input),
    signal, timeoutMs: 30_000, captureLimitBytes: 4 * 1024 * 1024 });
  if (result.aborted || result.timedOut || result.outputTruncated || result.exit.type !== "exited" || result.exit.code !== 0) {
    throw new Error(result.aborted ? "Cancelled." : result.timedOut ? "Customization compilation timed out." : decodeProcessText(result.stderr) || "Customization compilation failed.");
  }
  return JSON.parse(decodeProcessText(result.stdout)) as { baseId: string; files: Record<string, string>; code: string };
}

let previewMounted: { resolve: () => void; reject: (error: Error) => void } | undefined;
export function confirmDiffCustomizationPreviewMounted() { previewMounted?.resolve(); }
export function failDiffCustomizationPreview(error: Error) { previewMounted?.reject(error); }

export const diffCustomization = createDiffCustomizationController({
  readHistory: () => {
    const text = customizationStorage().read("history.json", { format: "text" });
    return text === undefined ? undefined : JSON.parse(text);
  },
  saveHistory: history => customizationStorage().write("history.json", history, { format: "json" }),
  baseline: async signal => {
    const value = await runCompiler(["--baseline"], undefined, signal);
    if (typeof value.baseId !== "string" || !value.files || typeof value.files !== "object") throw new Error("Invalid customization baseline.");
    return value as DiffCustomizationBaseline;
  },
  compile: async (baseline, files, signal) => {
    const result = await runCompiler([], { baseId: baseline.baseId, files }, signal);
    if (typeof result.code !== "string" || result.baseId !== baseline.baseId) throw new Error("Invalid customization compiler response.");
    return result.code;
  },
  generate: (prompt, tool, signal) => runDiffCustomizationAI(prompt, tool, decodeURIComponent(customizationStorage().ensureDirectory().uri.replace(/^file:\/\//, "")), signal),
  validate: version => { getDiffCustomizationComponent(version, true); },
  async openPreview() {
    const mounted = new Promise<void>((resolve, reject) => { previewMounted = { resolve, reject }; });
    const timeout = setTimeout(() => previewMounted?.reject(new Error("The customization preview could not render.")), 15_000);
    try {
      await openWindow({ id: diffCustomizationPreviewWindowId, component: diffCustomizationPreviewModuleName, title: "Customize App — Preview",
        size: { width: 1180, height: 780 }, macos: { restoreOnLaunch: false } });
      await mounted;
    } finally { clearTimeout(timeout); previewMounted = undefined; }
  },
  closePreview: async () => {
    previewMounted?.reject(new Error("Preview closed."));
    if ((await listWindows()).some(window => window.id === diffCustomizationPreviewWindowId)) await closeWindow(diffCustomizationPreviewWindowId);
  },
  prepareActivation: () => prepareDiffWindowsForTransition("customization"),
});

export function getDiffCustomizationSampleSource() {
  const file = customizationStorage().file("preview.diff");
  customizationStorage().write("preview.diff", "diff --git a/greeting.ts b/greeting.ts\nindex 1234567..7654321 100644\n--- a/greeting.ts\n+++ b/greeting.ts\n@@ -1,3 +1,4 @@\n export function greet(name: string) {\n-  return `Hello ${name}`;\n+  const greeting = `Hello, ${name}!`;\n+  return greeting;\n }\n", { format: "text" });
  return { kind: "diffFile" as const, label: "Customization sample", value: decodeURIComponent(file.uri.replace(/^file:\/\//, "")) };
}
