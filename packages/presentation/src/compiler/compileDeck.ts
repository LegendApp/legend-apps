import { getDeckSourceStructure, getSpeakerNotesTargets } from "../speakerNotesSource";
import { createPreviewIdentity } from "./previewIdentity";
import { builtinTransitionSources } from "../transitions";
import { resolveTransitionFile } from "./transitionLibrary";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { transformSync } from "@babel/core";
import { compile } from "@mdx-js/mdx";
import { build, type BuildResult, type Loader, type Message, type Plugin } from "esbuild";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import typegpuPlugin from "unplugin-typegpu/babel";
import { remarkSlideAttributes } from "./remarkSlideAttributes";
import { remarkNativeMarkdown } from "./remarkNativeMarkdown";
import { codeHighlightVersion, remarkCodeHighlight } from "./remarkCodeHighlight";
import { remarkSlides } from "./remarkSlides";
import { remarkWebviews } from "./remarkWebviews";
import { remarkSourceLocations } from "./remarkSourceLocations";
import type { CompileDeckResult } from "./types";
import { loadUniwindCompiler } from "./uniwindCompiler";
import { defaultEffectPacksDirectory, MissingEffectPack, repoEffectPacksDirectory, resolveEffectPack } from "./effectPacks";
import { isLocalPack, type EffectLock } from "../effectPacks/schema";
import { effectLockPath, readEffectLock, writeEffectLock } from "../effectPacks/storage";

// Pass plugin modules rather than paths so the shipped compiler can be a single bundle.
const workletsPlugin = require("react-native-worklets/plugin");
const reactCompilerPlugin = require("babel-plugin-react-compiler");
const reactNativePreset = require("@react-native/babel-preset");
type Timing = (phase: string, milliseconds: number) => void;
declare const __SLIDES_COMPILER_BUNDLE__: boolean;
export const hostModules = new Set([
  "react",
  "react/compiler-runtime",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-native",
  "react-native-reanimated",
  "react-native-worklets",
  "@legendapp/state",
  "@legendapp/state/react",
  "@legendapp/state/sync",
  "@legendapp/motion",
  "@legend-apps/presentation",
  "@shopify/react-native-skia",
  "number-flow-react-native/skia",
  "lottie-react-native",
  "@typegpu/noise",
  "@typegpu/react",
  "react-native-webgpu",
  "react-native-webview",
  "typegpu",
  "typegpu/common",
  "typegpu/data",
  "typegpu/std",
]);
const sourceExtensions = [
  "",
  ".macos.tsx",
  ".macos.ts",
  ".macos.jsx",
  ".macos.js",
  ".native.tsx",
  ".native.ts",
  ".native.jsx",
  ".native.js",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".json",
];
const assetExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".html", ".htm",
  ".ttf", ".otf", ".woff", ".woff2", ".mp4", ".mov", ".webm", ".mp3", ".wav", ".ogg", ".pdf",
]);

let transformVersion: string | undefined;
function getTransformVersion() {
  if (!transformVersion) {
    const version = createHash("sha256").update(fs.readFileSync(import.meta.filename));
    if (typeof __SLIDES_COMPILER_BUNDLE__ === "undefined") version.update(fs.readFileSync(path.resolve(import.meta.dirname, "../../../../bun.lock")));
    transformVersion = version.update(codeHighlightVersion).digest("hex");
  }
  return transformVersion;
}
function compileReactSource(source: string, filename: string, onTiming?: Timing) {
  const started = performance.now();
  const directory = process.env.LEGEND_SLIDES_TRANSFORM_CACHE ?? path.join(os.tmpdir(), "legend-slides-transforms");
  let file: string | undefined, key: string | undefined;
  if (directory) {
    const transformVersion = getTransformVersion();
    key = createHash("sha256").update(JSON.stringify([transformVersion, process.versions, process.cwd(), filename,
      process.env.NODE_ENV, process.env.BABEL_ENV, Object.entries(process.env).filter(([name]) => name.startsWith("WORKLETS_")).sort()]))
      .update(source).digest("hex");
    file = path.join(directory, createHash("sha256").update(filename).digest("hex") + ".cache");
    try {
      const cached = fs.readFileSync(file, "utf8");
      if (cached.startsWith(`${key}\n`)) {
        const end = cached.indexOf("\n", key.length + 1), code = cached.slice(end + 1);
        if (cached.slice(key.length + 1, end) === createHash("sha256").update(code).digest("hex")) {
          onTiming?.("transformCacheRead", performance.now() - started);
          return code;
        }
      }
    } catch { /* Missing or damaged entries are rebuilt from source. */ }
  }
  if (directory) onTiming?.("transformCacheLookup", performance.now() - started);
  // Preserve component and Hook imports until React Compiler has analyzed them.
  // Serialize worklets before bundling turns imported functions into namespace
  // member reads, which would capture their entire host module on the UI thread.
  const transformStarted = performance.now();
  const code = transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [[reactCompilerPlugin, { target: "19" }], typegpuPlugin, [workletsPlugin, { disableSourceMaps: true }]],
  })?.code ?? source;
  onTiming?.("babelTransform", performance.now() - transformStarted);
  if (file) {
    const storeStarted = performance.now();
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(temporary, `${key}\n${createHash("sha256").update(code).digest("hex")}\n${code}`);
      fs.renameSync(temporary, file);
      // Keep only the latest transform per file, bounded across closed decks.
      const entries = fs.readdirSync(directory).filter(name => name.endsWith(".cache"));
      if (entries.length > 256) {
        const oldest = entries.map(name => ({ name, time: fs.statSync(path.join(directory, name), { throwIfNoEntry: false })?.mtimeMs ?? 0 })).sort((a, b) => a.time - b.time);
        for (const entry of oldest.slice(0, entries.length - 256)) fs.rmSync(path.join(directory, entry.name), { force: true });
      }
    } catch { /* Cache storage is optional, including on read-only filesystems. */ }
    finally { try { fs.rmSync(temporary, { force: true }); } catch {} }
    onTiming?.("transformCacheWrite", performance.now() - storeStarted);
  }
  return code;
}

function isWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveLocalFile(importPath: string) {
  for (const extension of sourceExtensions) {
    const candidate = `${importPath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  for (const extension of sourceExtensions.slice(1)) {
    const candidate = path.join(importPath, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function preprocessDeck(source: string) {
  const original = source;
  const { comments, frontmatter, separators } = getDeckSourceStructure(source);
  const replacements = [
    ...separators.map(range => ({ start: range.start, end: range.end, value: "\n\n<SlideSeparator />\n\n" })),
    ...comments.map(comment => ({ start: comment.start, end: comment.end,
      value: `<PresenterNote encoded="${Buffer.from(source.slice(comment.contentStart, comment.contentEnd).trim()).toString("base64")}" />` })),
    ...frontmatter.filter(range => !range.document).map(range => ({ start: range.fullStart, end: range.fullEnd,
      value: `<SlideFrontmatter encoded="${Buffer.from(source.slice(range.start, range.end)).toString("base64")}" />\n` })),
  ].sort((a, b) => b.start - a.start);
  for (const { start, end, value } of replacements) source = source.slice(0, start) + value + source.slice(end);
  return {
    source,
    originalLocation(line: number, column: number) {
      const lineStarts = [0, ...Array.from(source.matchAll(/\r\n|\r|\n/g), match => match.index + match[0].length)];
      let offset = lineStarts[line - 1] + column - 1;
      // Undo edits in reverse application order. Generated markup has no exact source position.
      for (const { start, end, value } of [...replacements].reverse()) {
        if (offset < start) break;
        if (offset < start + value.length) return undefined;
        offset += end - start - value.length;
      }
      const lines = original.slice(0, offset).split(/\r\n|\r|\n/);
      return { line: lines.length, column: lines[lines.length - 1].length + 1 };
    },
  };
}

function mdxDeckPlugin(entryPath: string, extraDependencies: Set<string>, draftSource?: string, transitionDirectory?: string, onTiming?: Timing): Plugin {
  return {
    name: "legend-slides-mdx",
    setup(buildApi) {
      buildApi.onLoad({ filter: /\.mdx$/i }, async (args) => {
        const started = performance.now();
        const source = args.path === entryPath && draftSource !== undefined ? draftSource : fs.readFileSync(args.path, "utf8");
        const templates = new Map<string, string>();
        const transitions = new Set<string>();
        const preprocessed = preprocessDeck(source);
        let compiled;
        try { compiled = await compile(preprocessed.source, {
          jsx: true,
          jsxImportSource: "react",
          remarkPlugins: [
            () => () => { onTiming?.("mdxParse", performance.now() - started); },
            remarkFrontmatter,
            remarkGfm,
            remarkCodeHighlight,
            [remarkNativeMarkdown, { deckPath: args.path, dependencies: extraDependencies }],
            remarkSlideAttributes,
            [remarkWebviews, { deckPath: entryPath, dependencies: extraDependencies }],
            [remarkSlides, { templates, transitions, deckPath: args.path, dependencies: extraDependencies }],
            remarkSourceLocations({ deckPath: args.path, originalLine: (line, column) => preprocessed.originalLocation(line, column)?.line }),
          ],
        }); }
        catch (error) {
          // MDX syntax errors end with "(line:column-…)" but omit the file; report both like esbuild errors.
          const match = /^([\s\S]*?) \((\d+):(\d+)(?:-\d+:\d+)?\)$/.exec(error instanceof Error ? error.message : "");
          if (!match) throw error;
          const location = preprocessed.originalLocation(Number(match[2]), Number(match[3]));
          return { errors: [location
            ? { text: match[1], location: { file: args.path, ...location } }
            : { text: `${path.basename(args.path)}: ${match[1]}` }] };
        }
        const templateEntries = [...templates.entries()];
        const templateImports = templateEntries.map(([, importPath], index) =>
          `import __LegendSlidesTemplate${index} from ${JSON.stringify(importPath)};`
        );
        const templateExport = `export const __legendSlidesTemplates = {${templateEntries.map(([reference], index) =>
          `${JSON.stringify(reference)}: __LegendSlidesTemplate${index}`
        ).join(",")}};`;
        const refs = [...transitions];
        onTiming?.("mdx", performance.now() - started);
        // Validate before bundling, including named built-in overrides.
        refs.forEach((ref) => resolveTransitionFile(ref, path.dirname(entryPath), transitionDirectory));
        const transitionImports = refs.map((ref, i) => `import __Transition${i} from ${JSON.stringify("legend-transition:" + ref)};`);
        const transitionExport = `export const __legendSlidesTransitions = {${refs.map((ref, i) => `${JSON.stringify(ref)}: __Transition${i}`).join(",")}};`;
        const transformStarted = performance.now();
        const contents = compileReactSource([...templateImports, ...transitionImports, String(compiled), templateExport, transitionExport].join("\n"), `${args.path}.jsx`, onTiming);
        onTiming?.("mdxTransform", performance.now() - transformStarted);
        return {
          contents,
          loader: "jsx" as Loader,
        };
      });
    },
  };
}

export function localDeckPlugin(entryPath: string, transitionDirectory?: string,
  options: { effectPacksDirectory?: string; dependencies?: Set<string>; lock?: EffectLock; missingPacks?: Set<string>;
    packIds?: Set<string>; resolvedPins?: EffectLock["packs"]; onTiming?: Timing } = {}): Plugin {
  const deckRoot = fs.realpathSync(path.dirname(entryPath));
  return {
    name: "legend-slides-local-deck",
    setup(buildApi) {
      buildApi.onLoad({ filter: /\.[cm]?[jt]sx?$/i, namespace: "file" }, (args) => {
        const started = performance.now();
        const contents = compileReactSource(fs.readFileSync(args.path, "utf8"), args.path, options.onTiming);
        options.onTiming?.("sourceTransform", performance.now() - started);
        return { contents, loader: /\.[cm]?tsx?$/i.test(args.path) ? "tsx" : "jsx" };
      });
      const libraryRoots = new Map<string, string>();
      const packRoots = new Set<string>();
      const verified = new Set<string>();
      buildApi.onResolve({ filter: /^slides:/ }, (args) => {
        const started = performance.now();
        const id = /^slides:([a-z][a-z0-9-]*)\//.exec(args.path)?.[1];
        if (id) options.packIds?.add(id);
        try {
          const importerRoot = libraryRoots.get(args.importer);
          const pack = resolveEffectPack(args.path, options.effectPacksDirectory ?? defaultEffectPacksDirectory(),
            importerRoot && packRoots.has(importerRoot) ? importerRoot : undefined, options.lock, verified, path.dirname(entryPath),
            options.effectPacksDirectory ? undefined : repoEffectPacksDirectory());
          if (pack.local && options.resolvedPins) options.resolvedPins[pack.id] = pack.local;
          else if (pack.pin && options.resolvedPins) {
            const previous = options.resolvedPins[pack.id];
            if (previous && (isLocalPack(previous) || previous.version !== pack.pin.version || previous.sha256 !== pack.pin.sha256)) throw new Error(`Effect dependency conflict for "${pack.id}".`);
            options.resolvedPins[pack.id] = pack.pin;
          }
          libraryRoots.set(pack.file, pack.root);
          packRoots.add(pack.root);
          options.dependencies?.add(pack.manifest);
          return { path: pack.file };
        } catch (error) {
          if (error instanceof MissingEffectPack) options.missingPacks?.add(error.id);
          return { errors: [{ text: error instanceof Error ? error.message : String(error) }] };
        } finally {
          options.onTiming?.("packResolution", performance.now() - started);
        }
      });
      buildApi.onResolve({ filter: /^legend-transition:/ }, (args) => {
        const reference = args.path.slice("legend-transition:".length);
        const file = resolveTransitionFile(reference, deckRoot, transitionDirectory);
        if (file) {
          libraryRoots.set(file, reference.startsWith("./") ? deckRoot : fs.realpathSync(transitionDirectory!));
          return { path: file };
        }
        return { namespace: "builtin-transition", path: reference };
      });
      buildApi.onLoad({ filter: /.*/, namespace: "builtin-transition" }, (args) => ({ contents: builtinTransitionSources[args.path], loader: "ts" }));
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") {
          return { path: entryPath };
        }
        if (hostModules.has(args.path)) {
          return { external: true, path: args.path };
        }
        if (!args.path.startsWith(".")) {
          return { errors: [{ text: `Import "${args.path}" is not available to decks.` }] };
        }

        const unresolvedPath = path.resolve(path.dirname(args.importer), args.path);
        const resolvedPath = resolveLocalFile(unresolvedPath);
        if (!resolvedPath) {
          return { errors: [{ text: `Could not resolve local import "${args.path}".` }] };
        }
        const realPath = fs.realpathSync(resolvedPath);
        const allowedRoot = libraryRoots.get(args.importer) ?? deckRoot;
        if (!isWithin(allowedRoot, realPath)) {
          return { errors: [{ text: `Local import "${args.path}" escapes the ${libraryRoots.has(args.importer) ? "library" : "deck"} directory.` }] };
        }
        if (libraryRoots.has(args.importer)) libraryRoots.set(realPath, allowedRoot);
        return assetExtensions.has(path.extname(realPath).toLowerCase())
          ? { namespace: "deck-asset", path: realPath }
          : { path: realPath };
      });

      buildApi.onLoad({ filter: /.*/, namespace: "deck-asset" }, (args) => ({
        contents: `export default ${JSON.stringify(pathToFileURL(args.path).href)};`,
        loader: "js",
      }));
    },
  };
}

function formatMessages(messages: Message[]) {
  return messages.map((message) => {
    const location = message.location
      ? `${path.basename(message.location.file)}:${message.location.line}:${message.location.column}: `
      : "";
    return `${location}${message.text}`;
  });
}

function dependenciesFrom(result: BuildResult, workingDirectory: string) {
  return Object.keys(result.metafile?.inputs ?? {}).filter((input) => !input.startsWith("builtin-transition:")).map((input) => path.resolve(workingDirectory, input.replace(/^deck-asset:/, ""))).sort();
}

const cssPath = path.resolve(import.meta.dirname, "../../../../shell/src/global.css");

async function compileUniwind(deckRoot: string, draftSource?: string, packRoots: string[] = []) {
  const compileVirtual = await loadUniwindCompiler();
  // Tailwind scans an isolated copy for new draft classes; the actual deck and
  // its directory are never written until the user saves.
  const draftDirectory = draftSource === undefined ? undefined : fs.mkdtempSync(path.join(os.tmpdir(), "legend-slides-css-"));
  try {
  if (draftDirectory) fs.writeFileSync(path.join(draftDirectory, "draft.mdx"), draftSource!);
  const css = `${fs.readFileSync(cssPath, "utf8")}\n${[deckRoot, ...packRoots].map(root => `@source ${JSON.stringify(root)};`).join("\n")}\n${draftDirectory ? `@source ${JSON.stringify(draftDirectory)};` : ""}`;
  return await compileVirtual({
    css,
    cssPath,
    debug: false,
    platform: "native",
    polyfills: undefined,
    themes: ["light", "dark"],
  });
  } finally {
    if (draftDirectory) fs.rmSync(draftDirectory, { recursive: true, force: true });
  }
}

export async function compileDeck(deckPath: string, options: { source?: string; transitionDirectory?: string; effectPacksDirectory?: string; onTiming?: Timing } = {}): Promise<CompileDeckResult> {
  const absoluteDeckPath = path.resolve(deckPath);
  const builtAt = Date.now();
  if (!absoluteDeckPath.toLowerCase().endsWith(".mdx")) {
    return { success: false, errors: ["Decks must use the .mdx extension."], warnings: [] };
  }
  if (!fs.existsSync(absoluteDeckPath)) {
    return { success: false, errors: [`Deck not found: ${absoluteDeckPath}`], warnings: [] };
  }

  const missingPacks = new Set<string>(), packIds = new Set<string>();
  try {
    const lock = readEffectLock(absoluteDeckPath), pins: EffectLock["packs"] = {};
    const source = options.source ?? fs.readFileSync(absoluteDeckPath, "utf8");
    const extraDependencies = new Set<string>();
    let started = performance.now();
    const result = await build({
      absWorkingDir: path.dirname(absoluteDeckPath),
      bundle: true,
      conditions: ["react-native"],
      entryPoints: [absoluteDeckPath],
      format: "cjs",
      jsx: "automatic",
      logLevel: "silent",
      mainFields: ["react-native", "module", "main"],
      metafile: true,
      outfile: "deck.js",
      platform: "neutral",
      plugins: [
        localDeckPlugin(absoluteDeckPath, options.transitionDirectory, { effectPacksDirectory: options.effectPacksDirectory,
          dependencies: extraDependencies, lock, missingPacks, packIds, resolvedPins: pins, onTiming: options.onTiming }),
        mdxDeckPlugin(absoluteDeckPath, extraDependencies, source, options.transitionDirectory, options.onTiming),
      ],
      resolveExtensions: [".macos.tsx", ".macos.ts", ".native.tsx", ".native.ts", ".tsx", ".ts", ".jsx", ".js", ".json"],
      sourcemap: "inline",
      // Decks bypass Metro's Babel pass. Hermes cannot evaluate async syntax.
      supported: { "async-await": false, "async-generator": false },
      target: "es2020",
      write: false,
    });
    options.onTiming?.("bundle", performance.now() - started);
    const output = result.outputFiles?.find((file) => file.path.endsWith("deck.js"));
    if (!output) {
      return { success: false, errors: ["The compiler did not produce a deck bundle."], warnings: [] };
    }
    // Built-in transition sources enter through a separate loader, so serialize
    // their worklets here too. Imported deck source was serialized before bundling.
    // Lower classes and scoped bindings for Hermes after bundling so generated
    // export getters are covered too. Deck helpers must stay inline.
    started = performance.now();
    const code = transformSync(output.text, {
      babelrc: false,
      comments: true,
      compact: false,
      configFile: false,
      filename: "deck.js",
      presets: [[reactNativePreset, { disableImportExportTransform: true, disableStaticViewConfigsCodegen: true, enableBabelRuntime: false, unstable_transformProfile: "hermes-stable" }]],
      plugins: [[workletsPlugin, { disableSourceMaps: true }]],
      sourceMaps: "inline",
      sourceType: "script",
    })?.code;
    options.onTiming?.("hermes", performance.now() - started);
    if (!code) {
      return { success: false, errors: ["The compiler did not produce a Hermes-compatible deck bundle."], warnings: [] };
    }
    started = performance.now();
    const uniwindCode = await compileUniwind(path.dirname(absoluteDeckPath), options.source,
      [...extraDependencies].filter(file => file.endsWith(`${path.sep}pack.json`)).map(file => path.dirname(file)));
    options.onTiming?.("styles", performance.now() - started);
    if (!lock && options.source === undefined && packIds.size && Object.keys(pins).length === packIds.size) {
      writeEffectLock(absoluteDeckPath, { schemaVersion: 1, packs: pins });
    }
    if (fs.existsSync(effectLockPath(absoluteDeckPath))) extraDependencies.add(effectLockPath(absoluteDeckPath));
    const dependencies = [...new Set([...dependenciesFrom(result, path.dirname(absoluteDeckPath)), ...extraDependencies])].sort();
    const previewIdentity = await createPreviewIdentity(absoluteDeckPath, source,
      [...dependencies.filter(file => file !== effectLockPath(absoluteDeckPath)), cssPath],
      JSON.stringify([
        getTransformVersion(), codeHighlightVersion,
        builtinTransitionSources, Object.entries(pins).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
        process.versions, process.cwd(), process.env.NODE_ENV, process.env.BABEL_ENV,
        Object.entries(process.env).filter(([name]) => name.startsWith("WORKLETS_")).sort(),
      ]), builtAt);
    return {
      effectPackIds: [...packIds].sort(),
      code,
      noteTargets: getSpeakerNotesTargets(source),
      previewIdentity,
      dependencies,
      success: true,
      uniwindCode,
      warnings: formatMessages(result.warnings),
    };
  } catch (error) {
    const errors = typeof error === "object" && error && "errors" in error
      ? formatMessages((error as { errors: Message[] }).errors)
      : [error instanceof Error ? error.message : String(error)];
    return { success: false, errors, warnings: [], effectPackIds: [...packIds].sort(), missingEffectPacks: [...missingPacks].sort() };
  }
}
