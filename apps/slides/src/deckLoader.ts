import * as Motion from "@legendapp/motion";
import * as LegendState from "@legendapp/state";
import * as LegendStateReact from "@legendapp/state/react";
import * as LegendStateSync from "@legendapp/state/sync";
import * as Presentation from "@legend-apps/presentation";
import * as ReactNativeSkia from "@shopify/react-native-skia";
import * as TypeGPUNoise from "@typegpu/noise";
import * as TypeGPUReact from "@typegpu/react";
import { commandRunner } from "@legend-apps/command-runner";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { noteRecentDocument } from "@legend-apps/recent-documents";
import * as React from "react";
import * as JsxRuntime from "react/jsx-runtime";
import * as ReactNative from "react-native";
import * as ReactNativeWebGPU from "react-native-webgpu";
import * as ReactNativeWebview from "react-native-webview";
import * as TypeGPU from "typegpu";
import * as TypeGPUCommon from "typegpu/common";
import * as TypeGPUData from "typegpu/data";
import * as TypeGPUStd from "typegpu/std";
import { gunzipSync, strFromU8 } from "fflate";
import { Uniwind } from "uniwind";
import type { CompileDeckResult, CompileDeckSuccess } from "@legend-apps/presentation";
import { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate } from "./deckBuildPolicy";
import { getLastDeckPath, rememberDeckPath } from "./slidesPreferences";
import { getSlidesState, setSlidesState } from "./slidesStore";

const compilerPath = process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH;
let watcher: { remove(): void } | undefined;
let watchedDirectory: string | undefined;
let watchedDeckPath: string | undefined;
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
let buildSequence = 0;

// react-native-webgpu installs these globals after its constants module has
// already captured its exports, so expose the installed values to deck code.
const webGPUHostModule = {
  ...ReactNativeWebGPU,
  GPUBufferUsage: globalThis.GPUBufferUsage,
  GPUColorWrite: globalThis.GPUColorWrite,
  GPUMapMode: globalThis.GPUMapMode,
  GPUShaderStage: globalThis.GPUShaderStage,
  GPUTextureUsage: globalThis.GPUTextureUsage,
};

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
  "@typegpu/noise": TypeGPUNoise,
  "@typegpu/react": TypeGPUReact,
  "react-native-webgpu": webGPUHostModule,
  "react-native-webview": ReactNativeWebview,
  typegpu: TypeGPU,
  "typegpu/common": TypeGPUCommon,
  "typegpu/data": TypeGPUData,
  "typegpu/std": TypeGPUStd,
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

function watchDeckDirectory(path: string) {
  const directory = directoryName(path);
  if (watchedDirectory === directory && watchedDeckPath === path) {
    return;
  }
  watcher?.remove();
  watchedDirectory = directory;
  watchedDeckPath = path;
  watcher = watchDirectories([directory], () => scheduleRebuild(path));
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

export { getLastDeckPath } from "./slidesPreferences";

export async function loadDeck(path: string, remember = true) {
  const sequence = ++buildSequence;
  try {
    await buildDeck(path, remember, sequence);
  } catch (error) {
    if (sequence === buildSequence) {
      setSlidesState({ buildErrors: [error instanceof Error ? error.message : String(error)], status: "error" });
    }
  }
}

async function buildDeck(path: string, remember: boolean, sequence: number) {
  watchDeckDirectory(path);
  setSlidesState({ buildErrors: [], pendingDeck: null, status: "building" });
  if (!compilerPath) {
    setSlidesState({ buildErrors: ["The slides compiler path was not included in this build."], status: "error" });
    return;
  }

  const availability = await commandRunner.getAvailability(["bun"]);
  if (sequence !== buildSequence) {
    return;
  }
  if (!availability.bun) {
    setSlidesState({ buildErrors: ["Bun is required to compile local MDX decks."], status: "error" });
    return;
  }

  const commandResult = await commandRunner.runCommand({
    command: "bun",
    args: [compilerPath, path],
    timeoutMs: 60_000,
  });
  if (sequence !== buildSequence) {
    return;
  }

  let result: CompileDeckResult;
  try {
    if (commandResult.timedOut) {
      throw new Error("Deck compilation exceeded 60 seconds.");
    }
    result = parseCompilerResult(commandResult.stdout);
  } catch (error) {
    result = {
      success: false,
      errors: [commandResult.timedOut
        ? "Deck compilation exceeded 60 seconds."
        : commandResult.stderr || (error instanceof Error ? error.message : "The slides compiler returned an invalid response.")],
      warnings: [],
    };
  }

  if (!result.success) {
    setSlidesState(failedDeckUpdate(result));
    return;
  }

  // Do not evaluate deck code or replace global styles until the presenter
  // explicitly accepts the build. Check the lock after the asynchronous build.
  if (shouldDeferDeckUpdate(getSlidesState())) {
    setSlidesState({ pendingDeck: { path, result, remember }, status: "ready", buildWarnings: result.warnings });
    return;
  }
  publishDeck(result, path, remember);
}

export function applyPendingDeck() {
  const pending = getSlidesState().pendingDeck;
  if (pending) {
    publishDeck(pending.result, pending.path, pending.remember);
  }
}

function publishDeck(result: CompileDeckSuccess, path: string, remember: boolean) {
  try {
    const component = evaluateDeck(result.code);
    applyUniwindStyles(result.uniwindCode);
    setSlidesState(successfulDeckUpdate(getSlidesState(), component, path, result.warnings));
    if (remember) {
      rememberDeckPath(path);
      noteRecentDocument(path);
    }
  } catch (error) {
    setSlidesState({
      buildErrors: [error instanceof Error ? error.message : String(error)],
      status: "error",
    });
  }
}
