import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compile } from "@mdx-js/mdx";
import { build, type BuildResult, type Loader, type Message, type Plugin } from "esbuild";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { parse as parseYaml } from "yaml";
import { remarkSlides } from "./remarkSlides";
import { remarkWebviews } from "./remarkWebviews";
import type { CompileDeckResult } from "./types";

const hostModules = new Set([
  "react",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-native",
  "@legendapp/state",
  "@legendapp/state/react",
  "@legendapp/state/sync",
  "@legendapp/motion",
  "@legend-apps/presentation",
  "@shopify/react-native-skia",
  "react-native-webgpu",
  "react-native-webview",
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
const assetExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

function isWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function preprocessSlideFrontmatter(source: string) {
  const lines = source.match(/.*(?:\r?\n|$)/g) ?? [];
  const delimiters: number[] = [];
  let fence: "`" | "~" | undefined;

  lines.forEach((line, index) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      fence = fence === marker ? undefined : fence ?? marker;
      return;
    }
    if (!fence && /^---\s*(?:\r?\n)?$/.test(line)) {
      delimiters.push(index);
    }
  });

  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  const documentFrontmatterEnd = delimiters[0] === firstContentLine ? delimiters[1] : undefined;
  const replacements = new Map<number, { end: number; value: string }>();

  for (let delimiterIndex = documentFrontmatterEnd === undefined ? 0 : 2; delimiterIndex < delimiters.length - 1; delimiterIndex += 1) {
    const start = delimiters[delimiterIndex];
    const end = delimiters[delimiterIndex + 1];
    const yamlSource = lines.slice(start + 1, end).join("");
    try {
      const parsed = parseYaml(yamlSource);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const encoded = Buffer.from(yamlSource, "utf8").toString("base64");
        replacements.set(start, { end, value: `<SlideFrontmatter encoded="${encoded}" />\n` });
        delimiterIndex += 1;
      }
    } catch {
      // A normal thematic break can be followed by arbitrary Markdown.
    }
  }

  let output = "";
  for (let index = 0; index < lines.length; index += 1) {
    const replacement = replacements.get(index);
    if (replacement) {
      output += replacement.value;
      index = replacement.end;
    } else {
      output += lines[index];
    }
  }
  return output;
}

function preprocessNotes(source: string) {
  const lines = source.match(/.*(?:\r?\n|$)/g) ?? [];
  let fence: "`" | "~" | undefined;
  let markdown = "";
  let output = "";

  const flushMarkdown = () => {
    output += markdown.replace(/<!--([\s\S]*?)-->/g, (_match, note: string) => {
      const encoded = Buffer.from(note.trim(), "utf8").toString("base64");
      return `<PresenterNote encoded="${encoded}" />`;
    });
    markdown = "";
  };

  for (const line of lines) {
    const match = /^\s*(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = match[1][0] as "`" | "~";
      if (!fence) {
        flushMarkdown();
        fence = marker;
      } else if (fence === marker) {
        output += line;
        fence = undefined;
        continue;
      }
    }
    if (fence) {
      output += line;
    } else {
      markdown += line;
    }
  }
  flushMarkdown();
  return output;
}

function mdxDeckPlugin(entryPath: string, webviewDependencies: Set<string>): Plugin {
  return {
    name: "legend-slides-mdx",
    setup(buildApi) {
      buildApi.onLoad({ filter: /\.mdx$/ }, async (args) => {
        const source = fs.readFileSync(args.path, "utf8");
        const compiled = await compile(preprocessNotes(preprocessSlideFrontmatter(source)), {
          jsx: true,
          jsxImportSource: "react",
          remarkPlugins: [remarkFrontmatter, remarkGfm, [remarkWebviews, { deckPath: entryPath, dependencies: webviewDependencies }], remarkSlides],
        });
        return { contents: String(compiled), loader: "jsx" as Loader };
      });
    },
  };
}

function localDeckPlugin(entryPath: string): Plugin {
  const deckRoot = fs.realpathSync(path.dirname(entryPath));
  return {
    name: "legend-slides-local-deck",
    setup(buildApi) {
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
        if (!isWithin(deckRoot, realPath)) {
          return { errors: [{ text: `Local import "${args.path}" escapes the deck directory.` }] };
        }
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
      ? `${message.location.file}:${message.location.line}:${message.location.column}: `
      : "";
    return `${location}${message.text}`;
  });
}

function dependenciesFrom(result: BuildResult, workingDirectory: string) {
  return Object.keys(result.metafile?.inputs ?? {}).map((input) => path.resolve(workingDirectory, input)).sort();
}

async function compileUniwind(deckRoot: string) {
  const cssPath = path.resolve(import.meta.dirname, "../../../../shell/src/global.css");
  const compilerModulePath = path.resolve(import.meta.dirname, "../../../../shell/node_modules/uniwind/src/metro/compileVirtual.ts");
  const { compileVirtual } = await import(pathToFileURL(compilerModulePath).href) as {
    compileVirtual(options: {
      css: string;
      cssPath: string;
      debug: boolean;
      platform: string;
      polyfills: undefined;
      themes: string[];
    }): Promise<string>;
  };
  const css = `${fs.readFileSync(cssPath, "utf8")}\n@source ${JSON.stringify(deckRoot)};\n`;
  return compileVirtual({
    css,
    cssPath,
    debug: false,
    platform: "native",
    polyfills: undefined,
    themes: ["light", "dark"],
  });
}

export async function compileDeck(deckPath: string): Promise<CompileDeckResult> {
  const absoluteDeckPath = path.resolve(deckPath);
  if (!absoluteDeckPath.toLowerCase().endsWith(".mdx")) {
    return { success: false, errors: ["Decks must use the .mdx extension."], warnings: [] };
  }
  if (!fs.existsSync(absoluteDeckPath)) {
    return { success: false, errors: [`Deck not found: ${absoluteDeckPath}`], warnings: [] };
  }

  try {
    const webviewDependencies = new Set<string>();
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
        localDeckPlugin(absoluteDeckPath),
        mdxDeckPlugin(absoluteDeckPath, webviewDependencies),
      ],
      resolveExtensions: [".macos.tsx", ".macos.ts", ".native.tsx", ".native.ts", ".tsx", ".ts", ".jsx", ".js", ".json"],
      sourcemap: "inline",
      target: "es2020",
      write: false,
    });
    const output = result.outputFiles?.find((file) => file.path.endsWith("deck.js"));
    if (!output) {
      return { success: false, errors: ["The compiler did not produce a deck bundle."], warnings: [] };
    }
    return {
      code: output.text,
      dependencies: [...new Set([
        ...dependenciesFrom(result, path.dirname(absoluteDeckPath)),
        ...webviewDependencies,
      ])].sort(),
      success: true,
      uniwindCode: await compileUniwind(path.dirname(absoluteDeckPath)),
      warnings: formatMessages(result.warnings),
    };
  } catch (error) {
    const errors = typeof error === "object" && error && "errors" in error
      ? formatMessages((error as { errors: Message[] }).errors)
      : [error instanceof Error ? error.message : String(error)];
    return { success: false, errors, warnings: [] };
  }
}
