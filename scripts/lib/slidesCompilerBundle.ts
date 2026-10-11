import path from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "esbuild";
import { rootDir } from "./apps";

// The compiler's own esbuild lives with the presentation package.
const presentationRequire = createRequire(path.join(rootDir, "packages/presentation/package.json"));
const { build } = presentationRequire("esbuild") as typeof import("esbuild");

/** Native or self-locating packages stay on disk beside the bundle. */
export const slidesCompilerExternals = ["esbuild", "lightningcss", "@tailwindcss/oxide", "fsevents"];

/**
 * Where the bundle lives inside the helper. It sits four levels deep, like the compiler sources,
 * so source-relative `import.meta.dirname` paths resolve unchanged. It must stay outside the
 * `apps/` and `packages/` folders that global.css asks Tailwind to scan.
 */
export const slidesCompilerEntry = "runtime/compiler/dist/bin/compiler.mjs";

function staticUniwind(): Plugin {
  const compileVirtual = path.join(rootDir, "shell/node_modules/uniwind/src/metro/compileVirtual.ts");
  return {
    name: "slides-static-uniwind",
    setup(api) {
      api.onResolve({ filter: /\/uniwindCompiler$/ }, () => ({ path: "uniwind-compiler", namespace: "slides-uniwind" }));
      api.onLoad({ filter: /.*/, namespace: "slides-uniwind" }, () => ({
        contents: `import { compileVirtual } from ${JSON.stringify(compileVirtual)}; export async function loadUniwindCompiler() { return compileVirtual; }`,
        loader: "ts",
        resolveDir: path.dirname(compileVirtual),
      }));
    },
  };
}

/**
 * The worklets Babel plugin hands Babel `require.resolve` paths for its nested plugins.
 * Babel also accepts the modules themselves, which lets esbuild include them.
 */
function inlineWorkletsBabelPlugins(): Plugin {
  return {
    name: "slides-inline-worklets-babel-plugins",
    setup(api) {
      api.onLoad({ filter: /react-native-worklets\/plugin\/index\.js$/ }, async ({ path: file }) => {
        const fs = await import("node:fs");
        const source = fs.readFileSync(file, "utf8")
          .replace(/require\.resolve\(("@babel\/[^"]+")\)/g, "require($1)")
          // Only used to place generated worklet files in bundle mode, which the compiler does not use.
          .replace('require.resolve("react-native-worklets/package.json")', '__dirname + "/react-native-worklets/package.json"');
        return { contents: source, loader: "js" };
      });
    },
  };
}

/** Bundle the deck compiler into one ESM file that runs on Bun or Node 22+. */
export async function bundleSlidesCompiler(outfile: string) {
  const result = await build({
    entryPoints: [path.join(rootDir, "scripts/compile-slides.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    minify: true,
    legalComments: "eof",
    outfile,
    external: slidesCompilerExternals,
    nodePaths: [path.join(rootDir, "node_modules"), path.join(rootDir, "shell/node_modules"), path.join(rootDir, "packages/presentation/node_modules")],
    banner: { js: [
      'import { createRequire as __slidesCreateRequire } from "node:module";',
      'import { fileURLToPath as __slidesFileURLToPath } from "node:url";',
      'import { dirname as __slidesDirname } from "node:path";',
      "const require = __slidesCreateRequire(import.meta.url);",
      "const __filename = __slidesFileURLToPath(import.meta.url);",
      "const __dirname = __slidesDirname(__filename);",
    ].join("\n") },
    plugins: [staticUniwind(), inlineWorkletsBabelPlugins()],
    logLevel: "warning",
    metafile: true,
  });
  return result;
}
