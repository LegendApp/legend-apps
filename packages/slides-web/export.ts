import fs from "node:fs/promises";
import fsSync, { existsSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { brotliDecompressSync, gzipSync } from "node:zlib";
import { build, type Plugin } from "esbuild";
import { parseSync, traverse, transformSync, types as t, type NodePath } from "@babel/core";
import { compileDeck } from "../presentation/src/compiler/compileDeck";
import { loadUniwindCompiler } from "../presentation/src/compiler/uniwindCompiler";
import { createPreloadManifest } from "./preloadManifest";
import { ExportAssets, isAsset } from "./assets";

declare const __SLIDES_COMPILER_BUNDLE__: boolean;
const bundled = typeof __SLIDES_COMPILER_BUNDLE__ !== "undefined" && __SLIDES_COMPILER_BUNDLE__;
const root = path.resolve(import.meta.dirname, bundled ? "../../../.." : "../..");
const webRoot = path.join(root, "packages/slides-web");
const webRequire = createRequire(path.join(webRoot, "package.json"));
const workletsPlugin = require("react-native-worklets/plugin");
const src = path.join(webRoot, "src");
// How the web player renders each effect pack capability; any other capability is unsupported on web.
const webCapabilities: Record<string, string> = {
  reanimated: "Reanimated web", skia: "CanvasKit", lottie: "Skottie", "native-video": "HTML video", webgpu: "WebGPU (requires a WebGPU browser)",
};

export function webEffectSupport(found: { id: string; capabilities?: unknown }[]) {
  const packs = found.map(pack => ({ id: pack.id, capabilities: Array.isArray(pack.capabilities) ? pack.capabilities as string[] : [] }));
  const effects = Object.fromEntries(packs.map(pack => [pack.id, Object.fromEntries(pack.capabilities.map(capability => [capability, webCapabilities[capability] ?? "unsupported"]))]));
  const unsupported = packs.flatMap(pack => pack.capabilities.filter(capability => !webCapabilities[capability])
    .map(capability => `Effect pack "${pack.id}" is unsupported on web: it requires the native "${capability}" capability.`));
  return { effects, unsupported };
}

/** Export stages in order; `onProgress` reports the index of the stage that is starting. */
export const exportSteps = ["Compiling deck", "Copying assets", "Bundling player", "Compiling styles", "Writing files"] as const;
export type ExportOptions = { canvasKitURL?: string; transitionDirectory?: string; effectPacksDirectory?: string; onProgress?(step: number): void };

export class ExportError extends Error {
  constructor(message: string, readonly missingEffectPacks: string[] = []) { super(message); }
}

/** Turn file system failures into messages that name the folder and what to do. */
export function describeExportError(error: unknown) {
  const { code, path: file } = (error ?? {}) as { code?: string; path?: string };
  const where = file ? ` (${file})` : "";
  if (code === "ENOSPC" || code === "EDQUOT") return `Not enough disk space to finish the export${where}. Free up space or choose another drive.`;
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") return `Legend Slides can't write to the export folder${where}. Choose a folder you have permission to write to.`;
  return error instanceof Error ? error.message : String(error);
}

export function usesSkia(code: string) {
  // Inspect the compiled deck, including installed packs and attribute-generated effects.
  let needed = false;
  const skiaExports = new Set(["Effect", "LiquidGlass", "PresentationCanvas", "useNativeVideo", "Skia"]);
  const name = (key: t.Node, computed = false) => t.isIdentifier(key) && !computed ? key.name : t.isStringLiteral(key) ? key.value : "";
  const isHost = (object: t.Node | null | undefined, site: NodePath, seen = new Set<t.Node>()): boolean => {
    if (t.isCallExpression(object)) return t.isIdentifier(object.callee, { name: "require" })
      && !site.scope.getBinding("require") && t.isStringLiteral(object.arguments[0], { value: "@legend-apps/presentation" });
    if (!t.isIdentifier(object)) return false;
    const binding = site.scope.getBinding(object.name);
    if (!binding) return ["components", "presentation"].includes(object.name);
    if (!binding.constant || seen.has(binding.identifier) || !t.isVariableDeclarator(binding.path.node)) return false;
    seen.add(binding.identifier);
    const init = binding.path.node.init;
    // MDX emits this host component table, including attribute-generated effects.
    if (/^_components\d*$/.test(object.name) && t.isObjectExpression(init)
      && init.properties.some(property => t.isSpreadElement(property) && t.isMemberExpression(property.argument)
        && t.isIdentifier(property.argument.object, { name: "props" }) && name(property.argument.property, property.argument.computed) === "components")) return true;
    return isHost(init, binding.path, seen);
  };
  const tree = parseSync(code, { babelrc: false, configFile: false, sourceType: "script" });
  traverse(tree!, {
    CallExpression({ node, scope }) {
      if (t.isIdentifier(node.callee, { name: "require" }) && !scope.getBinding("require") && t.isStringLiteral(node.arguments[0])
        && ["@shopify/react-native-skia", "number-flow-react-native/skia", "lottie-react-native"].includes(node.arguments[0].value)) needed = true;
    },
    ObjectPattern(site) {
      const parent = site.parent;
      const object = t.isVariableDeclarator(parent) ? parent.init : t.isAssignmentExpression(parent) ? parent.right : undefined;
      if (site.node.properties.some(property => t.isObjectProperty(property)
        && skiaExports.has(name(property.key, property.computed))) && isHost(object, site)) needed = true;
    },
    MemberExpression(site) {
      if (skiaExports.has(name(site.node.property, site.node.computed)) && isHost(site.node.object, site)) needed = true;
    },
  });
  return needed;
}

/** Shared with helper packaging so only the actual browser input closure is shipped. */
export async function buildBrowserPlayer(deckCode: string, preload: unknown[], skia: boolean, font: string, outfile: string, canvasKitURL?: string, write = true) {
  const aliases: Record<string, string> = {
    "react-native": path.join(src, "native.tsx"),
    "@shopify/react-native-skia": path.join(src, "skia.tsx"),
    "@legend-apps/scaled-view": path.join(src, "scaled.tsx"),
    "lottie-react-native": path.join(src, "lottie.tsx"),
  };
  // The helper also keeps browser-component dependencies under .compiler; use one React/state instance.
  for (const name of ["react", "react/compiler-runtime", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client", "@legendapp/state", "@legendapp/state/react", "@legendapp/state/sync"]) {
    aliases[name] = webRequire.resolve(name);
  }
  const replacements: Record<string, string> = {
    "NativeVideoView.tsx": "video.tsx",
    "slidesSettings.ts": "settings.ts",
    "CodeBlock.tsx": "code.tsx",
    "Webview.tsx": "webview.tsx",
    "brightnessDiagnostics.ts": "settings.ts",
  };
  const plugin: Plugin = {
    name: "legend-slides-browser",
    setup(api) {
      api.onResolve({ filter: /^virtual:deck$/ }, () => ({ path: "deck", namespace: "compiled" }));
      api.onResolve({ filter: /^virtual:preload$/ }, () => ({ path: "preload", namespace: "compiled" }));
      api.onLoad({ filter: /.*/, namespace: "compiled" }, args => ({ contents: args.path === "preload" ? `export default ${JSON.stringify(preload)};` : deckCode, loader: "js", resolveDir: src }));
      api.onResolve({ filter: /.*/ }, args => {
        if (aliases[args.path]) return { path: aliases[args.path] };
        if (args.path.startsWith(".")) {
          const target = path.basename(args.path);
          const key = Object.keys(replacements).find(key => key.replace(/\.[jt]sx?$/, "") === target || key === target);
          if (key && /\/(presentation\/src|slides\/src)\//.test(args.importer)) return { path: path.join(src, replacements[key]) };
        }
      });
      api.onLoad({ filter: /\.[jt]sx?$/ }, async args => {
        if (args.path.includes("/node_modules/")) return;
        const source = await fs.readFile(args.path, "utf8");
        const code = transformSync(source, { filename: args.path, babelrc: false, configFile: false,
          parserOpts: { plugins: ["typescript", "jsx"] }, plugins: [[workletsPlugin, { disableSourceMaps: true }]] })?.code;
        return { contents: code ?? source, loader: /tsx?$/.test(args.path) ? "tsx" : "jsx" };
      });
    },
  };
  return build({ entryPoints: [path.join(src, "bootstrap.ts")], outfile, bundle: true,
    format: "iife", platform: "browser", target: "es2022", resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], jsx: "automatic", minify: true, sourcemap: "external",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", __DEV__: "false", global: "globalThis",
      __SLIDES_SKIA__: JSON.stringify(skia), __SLIDES_CANVASKIT_URL__: JSON.stringify(canvasKitURL) ?? "undefined", __SLIDES_FONT__: JSON.stringify(font) },
    external: ["fs", "path"], logLevel: "silent",
    nodePaths: [path.join(webRoot, "node_modules"), path.join(root, "apps/slides/node_modules"), path.join(root, "shell/node_modules")], plugins: [plugin], metafile: true, write });
}

async function buildWebsite(deck: string, output: string, options: ExportOptions) {
  const deckPath = path.resolve(deck);
  const deckRoot = path.dirname(deckPath);
  const out = path.resolve(output);
  options.onProgress?.(0);
  const result = await compileDeck(deckPath, { transitionDirectory: options.transitionDirectory, effectPacksDirectory: options.effectPacksDirectory });
  if (!result.success) throw new ExportError(result.errors.join("\n"), result.missingEffectPacks);
  const packs = await Promise.all(result.dependencies.filter(file => path.basename(file) === "pack.json").map(async file => JSON.parse(await fs.readFile(file, "utf8"))));
  const { effects, unsupported } = webEffectSupport(packs);
  for (const warning of unsupported) console.warn(warning);
  const skia = usesSkia(result.code);
  const font = skia ? gzipSync(await fs.readFile(path.join(webRoot, "assets/Roboto.ttf")), { level: 9 }).toString("base64") : "";
  options.onProgress?.(1);
  await fs.mkdir(out, { recursive: true });
  const assets = new ExportAssets(deckRoot, out);
  const dependencies = result.dependencies.map(file => file.replace(/^.*deck-asset:/, ""));
  const deckCode = await assets.deck(result.code, deckPath, skia);
  for (const file of dependencies.filter(file => isAsset(file) && !file.includes("/node_modules/"))) {
    if (!assets.embedded.has(file)) await assets.copy(file);
    const stem = file.replace(/\.(html|png)$/i, "");
    for (const ext of [".mp4", ".mov"]) {
      const media = stem + ext;
      if (await fs.stat(media).catch(() => null)) await assets.copy(media);
    }
  }
  if (skia && options.canvasKitURL) assets.remoteURLs.add(options.canvasKitURL);
  const copied = assets.copied;
  const preload = await createPreloadManifest(deckPath, dependencies, [...copied]);
  for (const asset of preload) {
    asset.version = createHash("sha256").update(await fs.readFile(path.join(out, decodeURIComponent(asset.source)))).digest("hex");
  }
  options.onProgress?.(2);
  const bundle = await buildBrowserPlayer(deckCode, preload, skia, font, path.join(out, "player.js"), options.canvasKitURL, false);
  for (const file of bundle.outputFiles!) {
    if (!file.path.endsWith(".map")) await fs.writeFile(file.path, file.contents);
  }
  if (skia) {
    if (!options.canvasKitURL) {
      const kit = await fs.readFile(webRequire.resolve("canvaskit-wasm/bin/full/canvaskit.js").replace(/\.js$/, bundled ? ".wasm.br" : ".wasm"));
      const wasm = bundled ? brotliDecompressSync(kit) : kit;
      await fs.writeFile(path.join(out, "canvaskit.js"), `globalThis.__legendSlidesWasmGzip="${gzipSync(wasm, { level: 9 }).toString("base64")}";`);
    }
    await fs.copyFile(path.join(webRoot, "assets/OFL.txt"), path.join(out, "OFL.txt"));
  }
  options.onProgress?.(3);
  const cssPath = path.join(root, "shell/src/global.css");
  const compileVirtual = await loadUniwindCompiler();
  const styleRoots = [deckRoot, ...dependencies.filter(file => file.endsWith(`${path.sep}pack.json`)).map(file => path.dirname(file))];
  const css = await compileVirtual({ css: `${await fs.readFile(cssPath, "utf8")}\n${styleRoots.map(directory => `@source ${JSON.stringify(directory)};`).join("\n")}`, cssPath, platform: "web", debug: false, polyfills: undefined, themes: ["light", "dark"] });
  options.onProgress?.(4);
  // Inline styles stay readable through CSSOM when canvas capture runs under file://.
  const styles = `${css}\n${await fs.readFile(path.join(src, "player.css"), "utf8")}`.replace(/<\/style/gi, "<\\/style");
  await fs.writeFile(path.join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legend Slides</title><style>${styles}</style></head><body><div id="root"></div><script src="./player.js"></script></body></html>`);
  const remoteURLs = [...assets.remoteURLs].sort();
  await fs.writeFile(path.join(out, "export.json"), JSON.stringify({ format: "legend-slides-web", version: 1,
    source: path.basename(deckPath), canvasKit: skia ? options.canvasKitURL ?? "./canvaskit.js" : null,
    assets: [...copied].map(file => path.relative(deckRoot, file)).sort(), preload, effects,
    remoteURLs, warnings: [...result.warnings, ...unsupported, ...remoteURLs.map(url => `Remote URL requires network: ${url}`)] }, null, 2));
  return bundle.outputFiles!.find(file => file.path.endsWith(".map"))!.contents;
}

/** Local debugging artifacts are kept outside the folder users publish. */
export function exportDebugDirectory(output: string) {
  const key = createHash("sha256").update(path.resolve(output)).digest("hex");
  return path.join(os.tmpdir(), "legend-slides-web", key);
}

export async function validateDestination(deck: string, output: string) {
  const deckRoot = path.dirname(await fs.realpath(deck));
  const requested = path.resolve(output);
  const destination = await fs.stat(requested).catch(() => null);
  if (destination && !destination.isDirectory()) throw new Error("Export destination must be a directory.");
  let ancestor = requested;
  while (!(await fs.stat(ancestor).catch(() => null))) ancestor = path.dirname(ancestor);
  const out = path.resolve(await fs.realpath(ancestor), path.relative(ancestor, requested));
  if (out === deckRoot || deckRoot.startsWith(out + path.sep) || out.startsWith(deckRoot + path.sep)) {
    throw new Error("Export destination must be separate from the source deck directory.");
  }
  const files = await fs.readdir(out).catch(() => []);
  if (files.length) {
    const manifest = await fs.readFile(path.join(out, "export.json"), "utf8").then(JSON.parse).catch(() => null);
    if (manifest?.format !== "legend-slides-web") throw new Error(`${out} already contains other files. Choose an empty folder or a previous Legend Slides export.`);
  }
  return out;
}

const activeStaging = new Set<string>();

export async function exportWebsite(deck: string, output: string, options: ExportOptions = {}) {
  if (options.canvasKitURL && !/^https?:\/\//.test(options.canvasKitURL)) throw new Error("CanvasKit URL must be an absolute HTTP(S) URL for hosted exports.");
  const deckPath = await fs.realpath(deck);
  const out = await validateDestination(deckPath, output);
  await fs.mkdir(path.dirname(out), { recursive: true });
  // PID ownership is part of the name so even a hard kill leaves enough information for cleanup.
  for (const entry of await fs.readdir(path.dirname(out), { withFileTypes: true })) {
    const owner = /^\.slides-export-(\d+)-[A-Za-z0-9]{6}(?:\.previous)?$/.exec(entry.name);
    const directory = path.join(path.dirname(out), entry.name);
    if (!entry.isDirectory() || !owner || directory === out || deckPath.startsWith(directory + path.sep)) continue;
    try { process.kill(Number(owner[1]), 0); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  }
  const staging = mkdtempSync(path.join(path.dirname(out), `.slides-export-${process.pid}-`));
  activeStaging.add(staging);
  try {
    const sourceMap = await buildWebsite(deckPath, staging, options);
    // Keep publication synchronous so cancellation cannot interrupt the replacement.
    const previous = staging + ".previous";
    const replacing = existsSync(out);
    if (replacing) fsSync.renameSync(out, previous);
    try { fsSync.renameSync(staging, out); }
    catch (error) {
      if (replacing) fsSync.renameSync(previous, out);
      throw error;
    }
    if (replacing) {
      activeStaging.add(previous);
      try { await fs.rm(previous, { recursive: true, force: true }); }
      finally { activeStaging.delete(previous); }
    }
    const debug = exportDebugDirectory(out);
    await fs.mkdir(debug, { recursive: true });
    await fs.writeFile(path.join(debug, "player.js.map"), sourceMap);
    return out;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    activeStaging.delete(staging);
  }
}

export function cleanupExports() {
  for (const staging of activeStaging) rmSync(staging, { recursive: true, force: true });
}

if (import.meta.main && !bundled) {
  const [deck, flag, output, kitFlag, canvasKitURL] = process.argv.slice(2);
  if (!deck || flag !== "--out" || !output || (kitFlag && (kitFlag !== "--canvaskit-url" || !canvasKitURL))) throw new Error("Usage: bun packages/slides-web/export.ts deck.mdx --out dist/reactcon [--canvaskit-url https://host/canvaskit.wasm]");
  process.once("SIGTERM", () => { cleanupExports(); process.exit(143); });
  console.log(await exportWebsite(deck, output, { canvasKitURL }));
}
