import { getDeckSourceStructure, getSpeakerNotesTargets } from "../speakerNotesSource";
import { builtinTransitionSources } from "../transitions";
import { resolveTransitionFile } from "./transitionLibrary";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { transformSync } from "@babel/core";
import { compile } from "@mdx-js/mdx";
import { build, type BuildResult, type Loader, type Message, type Plugin } from "esbuild";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import typegpuPlugin from "unplugin-typegpu/babel";
import { remarkSlideAttributes } from "./remarkSlideAttributes";
import { remarkNativeMarkdown } from "./remarkNativeMarkdown";
import { remarkSlides } from "./remarkSlides";
import { remarkWebviews } from "./remarkWebviews";
import type { CompileDeckResult } from "./types";
import { loadUniwindCompiler } from "./uniwindCompiler";
import { defaultEffectPacksDirectory, MissingEffectPack, resolveEffectPack } from "./effectPacks";
import type { EffectLock } from "../effectPacks/schema";
import { effectLockPath, installedPacksDirectory, readEffectLock, writeEffectLock } from "../effectPacks/storage";

// Pass plugin modules rather than paths so the shipped compiler can be a single bundle.
const workletsPlugin = require("react-native-worklets/plugin");
const reactCompilerPlugin = require("babel-plugin-react-compiler");
const reactNativePreset = require("@react-native/babel-preset");
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

function compileReactSource(source: string, filename: string) {
  // Preserve component and Hook imports until React Compiler has analyzed them.
  // Serialize worklets before bundling turns imported functions into namespace
  // member reads, which would capture their entire host module on the UI thread.
  return transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [[reactCompilerPlugin, { target: "19" }], typegpuPlugin, [workletsPlugin, { disableSourceMaps: true }]],
  })?.code ?? source;
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

function mdxDeckPlugin(entryPath: string, extraDependencies: Set<string>, draftSource?: string, transitionDirectory?: string): Plugin {
  return {
    name: "legend-slides-mdx",
    setup(buildApi) {
      buildApi.onLoad({ filter: /\.mdx$/i }, async (args) => {
        const source = args.path === entryPath && draftSource !== undefined ? draftSource : fs.readFileSync(args.path, "utf8");
        const templates = new Map<string, string>();
        const transitions = new Set<string>();
        const preprocessed = preprocessDeck(source);
        let compiled;
        try { compiled = await compile(preprocessed.source, {
          jsx: true,
          jsxImportSource: "react",
          remarkPlugins: [
            remarkFrontmatter,
            remarkGfm,
            [remarkNativeMarkdown, { deckPath: args.path, dependencies: extraDependencies }],
            remarkSlideAttributes,
            [remarkWebviews, { deckPath: entryPath, dependencies: extraDependencies }],
            [remarkSlides, { templates, transitions, deckPath: args.path, dependencies: extraDependencies }],
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
        // Validate before bundling, including named built-in overrides.
        refs.forEach((ref) => resolveTransitionFile(ref, path.dirname(entryPath), transitionDirectory));
        const transitionImports = refs.map((ref, i) => `import __Transition${i} from ${JSON.stringify("legend-transition:" + ref)};`);
        const transitionExport = `export const __legendSlidesTransitions = {${refs.map((ref, i) => `${JSON.stringify(ref)}: __Transition${i}`).join(",")}};`;
        return {
          contents: compileReactSource([...templateImports, ...transitionImports, String(compiled), templateExport, transitionExport].join("\n"), `${args.path}.jsx`),
          loader: "jsx" as Loader,
        };
      });
    },
  };
}

export function localDeckPlugin(entryPath: string, transitionDirectory?: string,
  options: { effectPacksDirectory?: string; dependencies?: Set<string>; lock?: EffectLock; missingPacks?: Set<string>;
    packIds?: Set<string>; resolvedPins?: EffectLock["packs"] } = {}): Plugin {
  const deckRoot = fs.realpathSync(path.dirname(entryPath));
  return {
    name: "legend-slides-local-deck",
    setup(buildApi) {
      buildApi.onLoad({ filter: /\.[cm]?[jt]sx?$/i, namespace: "file" }, (args) => ({
        contents: compileReactSource(fs.readFileSync(args.path, "utf8"), args.path),
        loader: /\.[cm]?tsx?$/i.test(args.path) ? "tsx" : "jsx",
      }));
      const libraryRoots = new Map<string, string>();
      const packRoots = new Set<string>();
      const verified = new Set<string>();
      buildApi.onResolve({ filter: /^slides:/ }, (args) => {
        const id = /^slides:([a-z][a-z0-9-]*)\//.exec(args.path)?.[1];
        if (id) options.packIds?.add(id);
        try {
          const importerRoot = libraryRoots.get(args.importer);
          const pack = resolveEffectPack(args.path, options.effectPacksDirectory ?? defaultEffectPacksDirectory(),
            importerRoot && packRoots.has(importerRoot) ? importerRoot : undefined, options.lock, verified);
          if (pack.pin && options.resolvedPins) {
            const previous = options.resolvedPins[pack.id];
            if (previous && (previous.version !== pack.pin.version || previous.sha256 !== pack.pin.sha256)) throw new Error(`Effect dependency conflict for "${pack.id}".`);
            options.resolvedPins[pack.id] = pack.pin;
          }
          libraryRoots.set(pack.file, pack.root);
          packRoots.add(pack.root);
          options.dependencies?.add(pack.manifest);
          return { path: pack.file };
        } catch (error) {
          if (error instanceof MissingEffectPack) options.missingPacks?.add(error.id);
          return { errors: [{ text: error instanceof Error ? error.message : String(error) }] };
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
  return Object.keys(result.metafile?.inputs ?? {}).filter((input) => !input.startsWith("builtin-transition:")).map((input) => path.resolve(workingDirectory, input)).sort();
}

async function compileUniwind(deckRoot: string, draftSource?: string, packRoots: string[] = []) {
  const cssPath = path.resolve(import.meta.dirname, "../../../../shell/src/global.css");
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

export async function compileDeck(deckPath: string, options: { source?: string; transitionDirectory?: string; effectPacksDirectory?: string } = {}): Promise<CompileDeckResult> {
  const absoluteDeckPath = path.resolve(deckPath);
  if (!absoluteDeckPath.toLowerCase().endsWith(".mdx")) {
    return { success: false, errors: ["Decks must use the .mdx extension."], warnings: [] };
  }
  if (!fs.existsSync(absoluteDeckPath)) {
    return { success: false, errors: [`Deck not found: ${absoluteDeckPath}`], warnings: [] };
  }

  const missingPacks = new Set<string>(), packIds = new Set<string>();
  try {
    const lock = readEffectLock(absoluteDeckPath), pins: EffectLock["packs"] = {};
    const packsDirectory = options.effectPacksDirectory ?? (lock ? installedPacksDirectory() : defaultEffectPacksDirectory());
    const source = options.source ?? fs.readFileSync(absoluteDeckPath, "utf8");
    const extraDependencies = new Set<string>();
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
        localDeckPlugin(absoluteDeckPath, options.transitionDirectory, { effectPacksDirectory: packsDirectory,
          dependencies: extraDependencies, lock, missingPacks, packIds, resolvedPins: pins }),
        mdxDeckPlugin(absoluteDeckPath, extraDependencies, source, options.transitionDirectory),
      ],
      resolveExtensions: [".macos.tsx", ".macos.ts", ".native.tsx", ".native.ts", ".tsx", ".ts", ".jsx", ".js", ".json"],
      sourcemap: "inline",
      // Decks bypass Metro's Babel pass. Hermes cannot evaluate async syntax.
      supported: { "async-await": false, "async-generator": false },
      target: "es2020",
      write: false,
    });
    const output = result.outputFiles?.find((file) => file.path.endsWith("deck.js"));
    if (!output) {
      return { success: false, errors: ["The compiler did not produce a deck bundle."], warnings: [] };
    }
    // Built-in transition sources enter through a separate loader, so serialize
    // their worklets here too. Imported deck source was serialized before bundling.
    // Lower classes and scoped bindings for Hermes after bundling so generated
    // export getters are covered too. Deck helpers must stay inline.
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
    if (!code) {
      return { success: false, errors: ["The compiler did not produce a Hermes-compatible deck bundle."], warnings: [] };
    }
    const uniwindCode = await compileUniwind(path.dirname(absoluteDeckPath), options.source,
      [...extraDependencies].filter(file => file.endsWith(`${path.sep}pack.json`)).map(file => path.dirname(file)));
    if (!lock && options.source === undefined && packIds.size && Object.keys(pins).length === packIds.size) {
      writeEffectLock(absoluteDeckPath, { schemaVersion: 1, packs: pins });
    }
    if (fs.existsSync(effectLockPath(absoluteDeckPath))) extraDependencies.add(effectLockPath(absoluteDeckPath));
    return {
      effectPackIds: [...packIds].sort(),
      code,
      noteTargets: getSpeakerNotesTargets(source),
      dependencies: [...new Set([
        ...dependenciesFrom(result, path.dirname(absoluteDeckPath)),
        ...extraDependencies,
      ])].sort(),
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
