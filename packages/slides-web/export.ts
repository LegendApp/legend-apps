import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { build, type Plugin } from "esbuild";
import { transformSync } from "@babel/core";
import { compileDeck } from "../presentation/src/compiler/compileDeck";
import { createPreloadManifest } from "./preloadManifest";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const src = path.join(import.meta.dirname, "src");
// How the web player renders each effect pack capability; any other capability is unsupported on web.
const webCapabilities: Record<string, string> = {
  reanimated: "Reanimated web", skia: "CanvasKit", lottie: "Skottie", "native-video": "HTML video", webgpu: "WebGPU (requires a WebGPU browser)",
};

export function webEffectSupport(packs: { id: string; capabilities: string[] }[]) {
  const effects = Object.fromEntries(packs.map(pack => [pack.id, Object.fromEntries(pack.capabilities.map(capability => [capability, webCapabilities[capability] ?? "unsupported"]))]));
  const unsupported = packs.flatMap(pack => pack.capabilities.filter(capability => !webCapabilities[capability])
    .map(capability => `Effect pack "${pack.id}" is unsupported on web: it requires the native "${capability}" capability.`));
  return { effects, unsupported };
}

async function buildWebsite(deck: string, output: string) {
  const deckPath = path.resolve(deck);
  const deckRoot = path.dirname(deckPath);
  const out = path.resolve(output);
  const result = await compileDeck(deckPath);
  if (!result.success) throw new Error(result.errors.join("\n"));
  const packs = await Promise.all(result.dependencies.filter(file => path.basename(file) === "pack.json").map(async file => JSON.parse(await fs.readFile(file, "utf8"))));
  const { effects, unsupported } = webEffectSupport(packs);
  for (const warning of unsupported) console.warn(warning);
  await fs.mkdir(out, { recursive: true });
  const assets = result.dependencies.map(file => file.includes("deck-asset:") ? file.slice(file.indexOf("deck-asset:") + 11) : file)
    .filter(file => /\.(png|jpe?g|gif|webp|svg|html|ttf|woff2?)$/i.test(file));
  const copied = new Set<string>();
  async function copyAsset(file: string) {
    if (copied.has(file)) return;
    const relative = path.relative(deckRoot, file);
    const resolvedRelative = path.relative(deckRoot, await fs.realpath(file));
    if ([relative, resolvedRelative].some(value => value === ".." || value.startsWith(".." + path.sep) || path.isAbsolute(value))) throw new Error(`Asset escapes deck: ${file}`);
    const dest = path.join(out, "assets", relative);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(file, dest);
    copied.add(file);
  }
  for (const file of assets) {
    await copyAsset(file);
    const stem = file.replace(/\.(html|png)$/i, "");
    for (const ext of [".mp4", ".mov"]) {
      const media = stem + ext;
      if (await fs.stat(media).catch(() => null)) await copyAsset(media);
    }
  }
  const preload = await createPreloadManifest(deckPath, result.dependencies.map(file => file.replace(/^.*deck-asset:/, "")), [...copied]);
  for (const asset of preload) {
    asset.version = createHash("sha256").update(await fs.readFile(path.join(out, decodeURIComponent(asset.source)))).digest("hex");
  }
  const deckCode = result.code.replaceAll(pathToFileURL(deckRoot).href + "/", "./assets/");
  const aliases: Record<string, string> = {
    "react-native": path.join(src, "native.tsx"),
    "@shopify/react-native-skia": path.join(src, "skia.tsx"),
    "@legend-apps/scaled-view": path.join(src, "scaled.tsx"),
    "lottie-react-native": path.join(src, "lottie.tsx"),
  };
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
          parserOpts: { plugins: ["typescript", "jsx"] }, plugins: [[require.resolve("react-native-worklets/plugin"), { disableSourceMaps: true }]] })?.code;
        return { contents: code ?? source, loader: /tsx?$/.test(args.path) ? "tsx" : "jsx" };
      });
    },
  };
  await build({ entryPoints: [path.join(src, "bootstrap.ts")], outfile: path.join(out, "player.js"), bundle: true,
    format: "esm", platform: "browser", target: "es2022", resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], jsx: "automatic", minify: true, sourcemap: true,
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", __DEV__: "false", global: "globalThis" },
    external: ["fs", "path"], logLevel: "silent",
    nodePaths: [path.join(import.meta.dirname, "node_modules"), path.join(root, "apps/slides/node_modules"), path.join(root, "shell/node_modules")], plugins: [plugin] });
  const kit = require.resolve("canvaskit-wasm/bin/full/canvaskit.wasm");
  await fs.copyFile(kit, path.join(out, "canvaskit.wasm"));
  await fs.copyFile(path.join(import.meta.dirname, "assets/Roboto.ttf"), path.join(out, "Roboto.ttf"));
  await fs.copyFile(path.join(import.meta.dirname, "assets/OFL.txt"), path.join(out, "OFL.txt"));
  await fs.writeFile(path.join(out, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legend Slides</title><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./player.css"></head><body><div id="root"></div><script type="module" src="./player.js"></script></body></html>');
  const cssPath = path.join(root, "shell/src/global.css");
  const { compileVirtual } = await import(path.join(root, "shell/node_modules/uniwind/src/metro/compileVirtual.ts"));
  const css = await compileVirtual({ css: `${await fs.readFile(cssPath, "utf8")}\n@source ${JSON.stringify(deckRoot)};`, cssPath, platform: "web", debug: false, polyfills: undefined, themes: ["light", "dark"] });
  await fs.writeFile(path.join(out, "styles.css"), css);
  await fs.copyFile(path.join(src, "player.css"), path.join(out, "player.css"));
  await fs.writeFile(path.join(out, "export.json"), JSON.stringify({ format: "legend-slides-web", version: 1,
    source: path.basename(deckPath), assets: [...copied].map(file => path.relative(deckRoot, file)).sort(), preload, effects, warnings: [...result.warnings, ...unsupported] }, null, 2));
  return out;
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
    if (manifest?.format !== "legend-slides-web") throw new Error("Refusing to replace a directory that is not a Legend Slides export.");
  }
  return out;
}

export async function exportWebsite(deck: string, output: string) {
  const deckPath = await fs.realpath(deck);
  const out = await validateDestination(deckPath, output);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const staging = await fs.mkdtemp(path.join(path.dirname(out), ".slides-export-"));
  try {
    await buildWebsite(deckPath, staging);
    await fs.rm(out, { recursive: true, force: true });
    await fs.rename(staging, out);
    return out;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const [deck, flag, output] = process.argv.slice(2);
  if (!deck || flag !== "--out" || !output) throw new Error("Usage: bun packages/slides-web/export.ts deck.mdx --out dist/reactcon");
  console.log(await exportWebsite(deck, output));
}
