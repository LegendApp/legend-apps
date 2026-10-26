import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { build, type Plugin } from "esbuild";
import { parseSync, traverse, transformSync, types as t } from "@babel/core";
import { compileDeck } from "../presentation/src/compiler/compileDeck";
import { createPreloadManifest } from "./preloadManifest";
import { ExportAssets, isAsset } from "./assets";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const src = path.join(import.meta.dirname, "src");

export type ExportOptions = { canvasKitURL?: string };

export function usesSkia(code: string) {
  // Inspect the compiled deck, including installed packs and attribute-generated effects.
  let needed = false;
  const skiaExports = new Set(["Effect", "LiquidGlass", "PresentationCanvas", "useNativeVideo", "Skia"]);
  const tree = parseSync(code, { babelrc: false, configFile: false, sourceType: "script" });
  traverse(tree!, {
    CallExpression({ node }) {
      if (t.isIdentifier(node.callee, { name: "require" }) && t.isStringLiteral(node.arguments[0])
        && ["@shopify/react-native-skia", "number-flow-react-native/skia"].includes(node.arguments[0].value)) needed = true;
    },
    ObjectPattern({ node }) {
      if (node.properties.some(property => t.isObjectProperty(property)
        && ((t.isIdentifier(property.key) && skiaExports.has(property.key.name))
          || (t.isStringLiteral(property.key) && skiaExports.has(property.key.value))))) needed = true;
    },
    MemberExpression({ node }) {
      const name = t.isIdentifier(node.property) ? node.property.name : t.isStringLiteral(node.property) ? node.property.value : "";
      if (skiaExports.has(name)) needed = true;
    },
  });
  return needed;
}

async function buildWebsite(deck: string, output: string, options: ExportOptions) {
  const deckPath = path.resolve(deck);
  const deckRoot = path.dirname(deckPath);
  const out = path.resolve(output);
  const result = await compileDeck(deckPath);
  if (!result.success) throw new Error(result.errors.join("\n"));
  const skia = usesSkia(result.code);
  const font = skia ? `data:font/ttf;base64,${(await fs.readFile(path.join(import.meta.dirname, "assets/Roboto.ttf"))).toString("base64")}` : "";
  await fs.mkdir(out, { recursive: true });
  const assets = new ExportAssets(deckRoot, out);
  const dependencies = result.dependencies.map(file => file.replace(/^.*deck-asset:/, ""));
  for (const file of dependencies.filter(file => isAsset(file) && !file.endsWith(".json"))) {
    await assets.copy(file);
    const stem = file.replace(/\.(html|png)$/i, "");
    for (const ext of [".mp4", ".mov"]) {
      const media = stem + ext;
      if (await fs.stat(media).catch(() => null)) await assets.copy(media);
    }
  }
  const deckCode = await assets.deck(result.code, deckPath, skia);
  if (skia && options.canvasKitURL) assets.remoteURLs.add(options.canvasKitURL);
  const copied = assets.copied;
  const preload = await createPreloadManifest(deckPath, dependencies, [...copied]);
  for (const asset of preload) {
    asset.version = createHash("sha256").update(await fs.readFile(path.join(out, decodeURIComponent(asset.source)))).digest("hex");
  }
  const aliases: Record<string, string> = {
    "react-native": path.join(src, "native.tsx"),
    "@shopify/react-native-skia": path.join(src, "skia.tsx"),
    "@legend-apps/scaled-view": path.join(src, "scaled.tsx"),
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
    format: "iife", platform: "browser", target: "es2022", resolveExtensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], jsx: "automatic", minify: true, sourcemap: true,
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", __DEV__: "false", global: "globalThis",
      __SLIDES_SKIA__: JSON.stringify(skia), __SLIDES_CANVASKIT_URL__: JSON.stringify(options.canvasKitURL) ?? "undefined", __SLIDES_FONT__: JSON.stringify(font) },
    external: ["fs", "path"], logLevel: "silent",
    nodePaths: [path.join(import.meta.dirname, "node_modules"), path.join(root, "apps/slides/node_modules"), path.join(root, "shell/node_modules")], plugins: [plugin] });
  if (skia) {
    if (!options.canvasKitURL) {
      const kit = await fs.readFile(require.resolve("canvaskit-wasm/bin/full/canvaskit.wasm"));
      await fs.writeFile(path.join(out, "canvaskit.js"), `globalThis.__legendSlidesWasmURL="data:application/wasm;base64,${kit.toString("base64")}";`);
    }
    await fs.copyFile(path.join(import.meta.dirname, "assets/OFL.txt"), path.join(out, "OFL.txt"));
  }
  const cssPath = path.join(root, "shell/src/global.css");
  const { compileVirtual } = await import(path.join(root, "shell/node_modules/uniwind/src/metro/compileVirtual.ts"));
  const styleRoots = [deckRoot, ...dependencies.filter(file => file.endsWith(`${path.sep}pack.json`)).map(file => path.dirname(file))];
  const css = await compileVirtual({ css: `${await fs.readFile(cssPath, "utf8")}\n${styleRoots.map(directory => `@source ${JSON.stringify(directory)};`).join("\n")}`, cssPath, platform: "web", debug: false, polyfills: undefined, themes: ["light", "dark"] });
  // Inline styles stay readable through CSSOM when canvas capture runs under file://.
  const styles = `${css}\n${await fs.readFile(path.join(src, "player.css"), "utf8")}`.replace(/<\/style/gi, "<\\/style");
  await fs.writeFile(path.join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legend Slides</title><style>${styles}</style></head><body><div id="root"></div><script src="./player.js"></script></body></html>`);
  const remoteURLs = [...assets.remoteURLs].sort();
  await fs.writeFile(path.join(out, "export.json"), JSON.stringify({ format: "legend-slides-web", version: 1,
    source: path.basename(deckPath), canvasKit: skia ? options.canvasKitURL ?? "./canvaskit.js" : null,
    assets: [...copied].map(file => path.relative(deckRoot, file)).sort(), preload,
    remoteURLs, warnings: [...result.warnings, ...remoteURLs.map(url => `Remote URL requires network: ${url}`)] }, null, 2));
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

export async function exportWebsite(deck: string, output: string, options: ExportOptions = {}) {
  if (options.canvasKitURL && !/^https?:\/\//.test(options.canvasKitURL)) throw new Error("CanvasKit URL must be an absolute HTTP(S) URL for hosted exports.");
  const deckPath = await fs.realpath(deck);
  const out = await validateDestination(deckPath, output);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const staging = await fs.mkdtemp(path.join(path.dirname(out), ".slides-export-"));
  try {
    await buildWebsite(deckPath, staging, options);
    await fs.rm(out, { recursive: true, force: true });
    await fs.rename(staging, out);
    return out;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const [deck, flag, output, kitFlag, canvasKitURL] = process.argv.slice(2);
  if (!deck || flag !== "--out" || !output || (kitFlag && (kitFlag !== "--canvaskit-url" || !canvasKitURL))) throw new Error("Usage: bun packages/slides-web/export.ts deck.mdx --out dist/reactcon [--canvaskit-url https://host/canvaskit.wasm]");
  console.log(await exportWebsite(deck, output, { canvasKitURL }));
}
