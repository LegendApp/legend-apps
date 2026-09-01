import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build, type BuildResult, type Loader, type Plugin } from "esbuild";

type Node = {
  attributes?: Node[];
  children?: Node[];
  name?: string;
  type: string;
  value?: unknown;
  [key: string]: unknown;
};

type RemarkWebviewsOptions = {
  deckPath: string;
  dependencies: Set<string>;
};

const webSourceExtensions = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];
const webPackages = new Set([
  "react",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@legendapp/state",
  "@legendapp/state/react",
  "@legendapp/state/sync",
]);

function isWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveWebFile(importPath: string) {
  for (const extension of webSourceExtensions) {
    const candidate = `${importPath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  for (const extension of webSourceExtensions.slice(1)) {
    const candidate = path.join(importPath, `index${extension}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function findStringAttribute(node: Node, name: string) {
  const attribute = node.attributes?.find((item) => item.name === name);
  return typeof attribute?.value === "string" ? attribute.value : undefined;
}

function setStringAttribute(node: Node, name: string, value: string) {
  const attributes = node.attributes ?? [];
  node.attributes = attributes.filter((attribute) => attribute.name !== name);
  node.attributes.push({ type: "mdxJsxAttribute", name, value });
}

function removeAttribute(node: Node, name: string) {
  node.attributes = node.attributes?.filter((attribute) => attribute.name !== name);
}

function browserDeckPlugin(deckRoot: string, dependencies: Set<string>): Plugin {
  return {
    name: "legend-slides-webview-component",
    setup(buildApi) {
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") {
          return undefined;
        }
        if (args.importer.includes("/node_modules/")) {
          return undefined;
        }
        if (!args.path.startsWith(".")) {
          if (webPackages.has(args.path)) {
            return undefined;
          }
          return { errors: [{ text: `Import "${args.path}" is not available to Webview components.` }] };
        }

        const unresolvedPath = path.resolve(path.dirname(args.importer), args.path);
        const resolvedPath = resolveWebFile(unresolvedPath);
        if (!resolvedPath) {
          return undefined;
        }
        const realPath = fs.realpathSync(resolvedPath);
        if (!isWithin(deckRoot, realPath)) {
          return { errors: [{ text: `Local Webview import "${args.path}" escapes the deck directory.` }] };
        }
        dependencies.add(realPath);
        return { path: realPath };
      });
    },
  };
}

function outputText(result: BuildResult, extension: string) {
  return result.outputFiles?.find((file) => file.path.endsWith(extension))?.text;
}

async function bundleComponent(componentPath: string, deckRoot: string, dependencies: Set<string>) {
  dependencies.add(componentPath);
  const componentImport = `./${path.relative(deckRoot, componentPath).split(path.sep).join("/")}`;
  const result = await build({
    bundle: true,
    define: { "process.env.NODE_ENV": '"production"' },
    format: "iife",
    jsx: "automatic",
    loader: {
      ".gif": "dataurl",
      ".jpeg": "dataurl",
      ".jpg": "dataurl",
      ".png": "dataurl",
      ".svg": "dataurl",
      ".ttf": "dataurl",
      ".webp": "dataurl",
      ".woff": "dataurl",
      ".woff2": "dataurl",
    },
    logLevel: "silent",
    minify: true,
    nodePaths: [
      path.resolve(import.meta.dirname, "../../node_modules"),
      path.resolve(import.meta.dirname, "../../../../node_modules"),
      path.resolve(import.meta.dirname, "../../../../apps/slides/node_modules"),
    ],
    outdir: "webview",
    platform: "browser",
    plugins: [browserDeckPlugin(deckRoot, dependencies)],
    stdin: {
      contents: [
        'import React from "react";',
        'import { createRoot } from "react-dom/client";',
        `import Component from ${JSON.stringify(componentImport)};`,
        'createRoot(document.getElementById("root")).render(React.createElement(Component, window.__LEGEND_SLIDES_PROPS__ ?? {}));',
      ].join("\n"),
      loader: "tsx" as Loader,
      resolveDir: deckRoot,
      sourcefile: "legend-slides-webview-entry.tsx",
    },
    target: "safari15",
    write: false,
  });

  const script = outputText(result, ".js");
  if (!script) {
    throw new Error(`The Webview compiler did not produce JavaScript for ${componentPath}.`);
  }
  return { css: outputText(result, ".css"), script };
}

export function remarkWebviews(options: RemarkWebviewsOptions) {
  return async (root: Node) => {
    const deckRoot = fs.realpathSync(path.dirname(options.deckPath));
    const baseUrl = `${pathToFileURL(deckRoot).href}/`;
    const bundles = new Map<string, Promise<{ css?: string; script: string }>>();

    const visit = async (node: Node): Promise<void> => {
      if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === "Webview") {
        setStringAttribute(node, "baseUrl", baseUrl);
        setStringAttribute(node, "readAccessUrl", baseUrl);

        const src = findStringAttribute(node, "src");
        if (src?.startsWith(".")) {
          const unresolvedPath = path.resolve(deckRoot, src);
          if (!fs.existsSync(unresolvedPath) || !fs.statSync(unresolvedPath).isFile()) {
            throw new Error(`Could not resolve local Webview page "${src}".`);
          }
          const realPath = fs.realpathSync(unresolvedPath);
          if (!isWithin(deckRoot, realPath)) {
            throw new Error(`Local Webview page "${src}" escapes the deck directory.`);
          }
          options.dependencies.add(realPath);
          setStringAttribute(node, "src", pathToFileURL(realPath).href);
        }

        const component = findStringAttribute(node, "component");
        if (node.attributes?.some((attribute) => attribute.name === "component") && !component) {
          throw new Error("Webview component paths must be string literals.");
        }
        if (component) {
          if (!component.startsWith(".")) {
            throw new Error("Webview component paths must be local to the deck directory.");
          }
          const resolvedPath = resolveWebFile(path.resolve(deckRoot, component));
          if (!resolvedPath) {
            throw new Error(`Could not resolve local Webview component "${component}".`);
          }
          const realPath = fs.realpathSync(resolvedPath);
          if (!isWithin(deckRoot, realPath)) {
            throw new Error(`Local Webview component "${component}" escapes the deck directory.`);
          }
          const bundle = bundles.get(realPath) ?? bundleComponent(realPath, deckRoot, options.dependencies);
          bundles.set(realPath, bundle);
          const { css, script } = await bundle;
          removeAttribute(node, "component");
          setStringAttribute(node, "componentScript", script);
          if (css) {
            setStringAttribute(node, "componentCss", css);
          }
        }
      }

      await Promise.all((node.children ?? []).map(visit));
    };

    await visit(root);
  };
}
