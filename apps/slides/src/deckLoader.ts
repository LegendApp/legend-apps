import * as Motion from "@legendapp/motion";
import * as LegendState from "@legendapp/state";
import * as LegendStateReact from "@legendapp/state/react";
import * as LegendStateSync from "@legendapp/state/sync";
import * as Presentation from "@legend-apps/presentation";
import * as ReactNativeSkia from "@shopify/react-native-skia";
import { commandRunner } from "@legend-apps/command-runner";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { noteRecentDocument } from "@legend-apps/recent-documents";
import { createStorage } from "@legend-apps/storage";
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as ReactNative from "react-native";
import * as ReactNativeWebGPU from "react-native-webgpu";
import * as ReactNativeWebview from "react-native-webview";
import { gunzipSync, strFromU8 } from "fflate";
import { Uniwind } from "uniwind";
import type { CompileDeckResult } from "@legend-apps/presentation";
import { getSlidesState, setSlidesState } from "./slidesStore";

const compilerPath = process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH;
const slidesStorage = createStorage({ subfolder: "slides" });
let watcher: { remove(): void } | undefined;
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
let buildSequence = 0;

const hostModules: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": JsxRuntime,
  "react/jsx-dev-runtime": JsxRuntime,
  "react-native": ReactNative,
  "@legendapp/state": LegendState,
  "@legendapp/state/react": LegendStateReact,
  "@legendapp/state/sync": LegendStateSync,
  "@legendapp/motion": Motion,
  "@legend-apps/presentation": Presentation,
  "@shopify/react-native-skia": ReactNativeSkia,
  "react-native-webgpu": ReactNativeWebGPU,
  "react-native-webview": ReactNativeWebview,
};

function evaluateDeck(code: string) {
  const module = { exports: {} as Record<string, unknown> };
  const deckRequire = (name: string) => {
    if (!(name in hostModules)) {
      throw new Error(`Deck requested unavailable host module "${name}".`);
    }
    return hostModules[name];
  };
  Function("require", "module", "exports", code)(deckRequire, module, module.exports);
  const component = module.exports.default;
  if (typeof component !== "function") {
    throw new Error("The compiled deck did not export an MDX component.");
  }
  return component as React.ComponentType<any>;
}

function applyUniwindStyles(code: string) {
  const createStyles = Function("rt", `return (${code});`) as (runtime: unknown) => unknown;
  (Uniwind as unknown as {
    __reinit(callback: (runtime: unknown) => unknown, themes: string[]): void;
  }).__reinit((runtime) => createStyles(runtime), ["light", "dark"]);
}

function scheduleRebuild(path: string) {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }
  rebuildTimer = setTimeout(() => void loadDeck(path, false), 120);
}

function directoryName(path: string) {
  return path.slice(0, Math.max(1, path.lastIndexOf("/")));
}

function decodeBase64(value: string) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseCompilerResult(stdout: string): CompileDeckResult {
  const envelope = JSON.parse(stdout) as { data?: unknown; encoding?: unknown };
  if (envelope.encoding !== "gzip-base64" || typeof envelope.data !== "string") {
    return envelope as CompileDeckResult;
  }
  return JSON.parse(strFromU8(gunzipSync(decodeBase64(envelope.data)))) as CompileDeckResult;
}

export function getLastDeckPath() {
  return slidesStorage.read<{ path?: string }>("recent.json", { format: "json" })?.path;
}

export async function loadDeck(path: string, remember = true) {
  const sequence = ++buildSequence;
  setSlidesState({ buildErrors: [], deckPath: path, status: "building" });
  if (!compilerPath) {
    setSlidesState({ buildErrors: ["The slides compiler path was not included in this build."], status: "error" });
    return;
  }

  const availability = await commandRunner.getAvailability(["bun"]);
  if (!availability.bun) {
    setSlidesState({ buildErrors: ["Bun is required to compile local MDX decks."], status: "error" });
    return;
  }

  const commandResult = await commandRunner.runCommand({
    command: "bun",
    args: [compilerPath, path],
    cwd: directoryName(directoryName(compilerPath)),
    timeoutMs: 30_000,
  });
  if (sequence !== buildSequence) {
    return;
  }

  let result: CompileDeckResult;
  try {
    result = parseCompilerResult(commandResult.stdout);
  } catch {
    result = {
      success: false,
      errors: [commandResult.stderr || "The slides compiler returned an invalid response."],
      warnings: [],
    };
  }

  if (!result.success) {
    setSlidesState({ buildErrors: result.errors, buildWarnings: result.warnings, status: "error" });
    return;
  }

  try {
    const component = evaluateDeck(result.code);
    applyUniwindStyles(result.uniwindCode);
    const previousSlide = getSlidesState().currentSlide;
    setSlidesState({
      buildErrors: [],
      buildWarnings: result.warnings,
      component,
      currentSlide: previousSlide,
      deckPath: path,
      revision: getSlidesState().revision + 1,
      status: "ready",
    });
    watcher?.remove();
    watcher = watchDirectories([directoryName(path)], () => scheduleRebuild(path));
    if (remember) {
      slidesStorage.write("recent.json", { path }, { format: "json" });
      noteRecentDocument(path);
    }
  } catch (error) {
    setSlidesState({
      buildErrors: [error instanceof Error ? error.message : String(error)],
      status: "error",
    });
  }
}
