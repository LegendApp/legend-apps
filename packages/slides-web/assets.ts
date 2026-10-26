import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSync, traverse, transformFromAstSync, types as t } from "@babel/core";
import { build } from "esbuild";

// Bun's streaming HTML parser handles entities, quoting, comments and raw script text.
type Element = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  remove(): void;
  onEndTag(callback: (tag: { before(value: string, options: { html: boolean }): void }) => Promise<void>): void;
};
declare const HTMLRewriter: new () => {
  on(selector: string, handlers: { element?: (element: Element) => void | Promise<void>; text?: (text: { text: string; remove(): void }) => void }): InstanceType<typeof HTMLRewriter>;
  transform(response: Response): Response;
};

const mime: Record<string, string> = {
  ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif", ".ttf": "font/ttf", ".otf": "font/otf",
  ".woff": "font/woff", ".woff2": "font/woff2", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".wasm": "application/wasm", ".pdf": "application/pdf",
};
export const isAsset = (file: string) => Object.hasOwn(mime, path.extname(file).toLowerCase());

export class ExportAssets {
  readonly copied = new Set<string>();
  readonly remoteURLs = new Set<string>();
  private visiting = new Set<string>();

  constructor(private root: string, private out: string) {}

  private destination(file: string) { return path.join(this.out, "assets", path.relative(this.root, file)); }

  private async validate(file: string) {
    const real = await fs.realpath(file).catch(() => { throw new Error(`Missing local export asset: ${file}`); });
    for (const candidate of [file, real]) {
      const relative = path.relative(this.root, candidate);
      if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new Error(`Asset escapes deck: ${file}`);
    }
  }

  private async dataURL(file: string) {
    if (this.visiting.has(file)) throw new Error(`Cyclic embedded asset reference: ${file}`);
    await this.copy(file);
    return `data:${mime[path.extname(file).toLowerCase()] ?? "application/octet-stream"};base64,${(await fs.readFile(this.destination(file))).toString("base64")}`;
  }

  async reference(reference: string, from: string, inline = false, base = pathToFileURL(from).href): Promise<string> {
    if (!reference || /^(?:#|data:|blob:|mailto:|tel:|javascript:)/i.test(reference)) return reference;
    const url = new URL(reference, base);
    if (/^https?:$/.test(url.protocol)) {
      this.remoteURLs.add(url.href);
      return url.href;
    }
    if (url.protocol !== "file:") throw new Error(`Unsupported export URL in ${from}: ${reference}`);
    const file = fileURLToPath(url);
    if (inline || /\.(?:ttf|otf|woff2?)$/i.test(file)) return (await this.dataURL(file)) + url.hash;
    await this.copy(file);
    const relative = path.relative(path.dirname(this.destination(from)), this.destination(file)).split(path.sep).map(encodeURIComponent).join("/");
    return (relative.startsWith(".") ? relative : "./" + relative) + url.search + url.hash;
  }

  async copy(file: string) {
    if (this.copied.has(file) || this.visiting.has(file)) return;
    await this.validate(file);
    this.visiting.add(file);
    const dest = this.destination(file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const ext = path.extname(file).toLowerCase();
    if ([".html", ".htm", ".svg", ".css", ".js", ".mjs"].includes(ext)) {
      const source = await fs.readFile(file, "utf8");
      const code = [".html", ".htm", ".svg"].includes(ext) ? await this.html(source, file)
        : ext === ".css" ? await this.css(source, file) : await this.script(source, file);
      await fs.writeFile(dest, code);
    } else {
      await fs.copyFile(file, dest);
    }
    this.visiting.delete(file);
    this.copied.add(file);
  }

  async deck(code: string, file: string, skia: boolean) {
    const tree = parseSync(code, { babelrc: false, configFile: false, sourceType: "script" })!;
    const strings: Array<{ start: number; end: number; value: string; script: boolean }> = [];
    traverse(tree, { StringLiteral(node) {
      const { start, end, value } = node.node;
      strings.push({ start: start!, end: end!, value, script: t.isObjectProperty(node.parent) && t.isIdentifier(node.parent.key, { name: "componentScript" }) });
    } });
    for (const item of strings.reverse()) {
      let value = item.value;
      for (const match of value.matchAll(/https?:\/\/[^\s<>"'`\\]+/g)) this.remoteURLs.add(match[0]);
      if (item.script) value = await this.script(value, file);
      else if (/^\s*<(?:!doctype\s+html|[a-z][a-z0-9-]*)\b/i.test(value)) value = await this.html(value, file, true);
      else if (value === pathToFileURL(this.root).href + "/") value = "./assets/";
      else if (value.startsWith("file:") || (/^(?:\.\.?\/)/.test(value) && isAsset(value.split(/[?#]/)[0]))) {
        const inline = /\.(?:ttf|otf|woff2?)(?:[?#]|$)/i.test(value) || (skia && /\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i.test(value));
        value = await this.reference(value, file, inline);
        if (!/^(?:data:|https?:)/.test(value)) value = "./assets/" + value.replace(/^\.\//, "");
      }
      if (value !== item.value) code = code.slice(0, item.start) + JSON.stringify(value) + code.slice(item.end);
    }
    return code;
  }

  async html(source: string, file: string, inline = false) {
    let base = pathToFileURL(file).href;
    await new HTMLRewriter().on("base[href]", { element(element) {
      base = new URL(element.getAttribute("href")!, base).href;
    } }).transform(new Response(source)).text();
    const rewrite = new HTMLRewriter().on("base", { element: element => element.remove() });
    rewrite.on("*", { element: async element => {
      for (const name of ["src", "href", "poster", "data", "xlink:href"]) {
        const value = element.getAttribute(name);
        if (value) element.setAttribute(name, await this.reference(value, file, inline, base));
      }
      const srcset = element.getAttribute("srcset");
      if (srcset) {
        const candidates = srcset.match(/(?:data:\S+|[^\s,]+)(?:\s+[\d.]+[wx])?/g) ?? [];
        element.setAttribute("srcset", (await Promise.all(candidates.map(async candidate => {
          const [url, descriptor] = candidate.split(/\s+/);
          return [await this.reference(url, file, inline, base), descriptor].filter(Boolean).join(" ");
        }))).join(", "));
      }
      const style = element.getAttribute("style");
      if (style) element.setAttribute("style", (await this.css(`x{${style}}`, file, base)).replace(/^x\s*\{|\}\s*$/g, "").trim());
      const srcdoc = element.getAttribute("srcdoc");
      if (srcdoc) element.setAttribute("srcdoc", await this.html(srcdoc, file, true));
    } });
    for (const tag of ["script", "style"]) {
      let content = "", executable = true;
      rewrite.on(tag, {
        element: element => {
          content = "";
          const type = element.getAttribute("type");
          executable = tag === "style" || !type || /^(?:module|text\/javascript|application\/javascript)$/.test(type);
          if (!executable) return;
          if (type === "module") element.removeAttribute("type");
          element.onEndTag(async end => {
            if (content.trim()) {
              const code = tag === "style" ? await this.css(content, file, base) : await this.script(content, file);
              end.before(code.replace(/<\/(script|style)/gi, "<\\/$1"), { html: true });
            }
          });
        },
        text: text => { if (executable) { content += text.text; text.remove(); } },
      });
    }
    return rewrite.transform(new Response(source)).text();
  }

  private async css(source: string, file: string, base = pathToFileURL(file).href) {
    const result = await build({ stdin: { contents: source, loader: "css", resolveDir: path.dirname(file), sourcefile: file },
      bundle: true, write: false, logLevel: "silent", plugins: [{ name: "offline-css", setup: api => {
        api.onResolve({ filter: /.*/ }, async args => {
          const from = args.importer || file;
          const url = new URL(args.path, args.importer ? pathToFileURL(from).href : base);
          if (/^https?:$/.test(url.protocol)) { this.remoteURLs.add(url.href); return { path: url.href, external: true }; }
          if (url.protocol === "data:") return { path: args.path, external: true };
          if (args.kind === "import-rule") {
            const imported = fileURLToPath(url);
            await this.validate(imported);
            return { path: imported };
          }
          return { path: await this.reference(url.href, from, true), external: true };
        });
      } }] });
    return result.outputFiles[0].text;
  }

  private async script(source: string, file: string) {
    const prepare = async (code: string, filename: string) => {
      const tree = parseSync(code, { filename, babelrc: false, configFile: false, sourceType: "unambiguous" })!;
      const references: Array<{ value: string; replace(value: string): void }> = [];
      traverse(tree, {
        StringLiteral: node => {
          for (const match of node.node.value.matchAll(/https?:\/\/[^\s<>"'`\\]+/g)) this.remoteURLs.add(match[0]);
          const parent = node.parent;
          const resource = t.isObjectProperty(parent) ? parent.key
            : t.isAssignmentExpression(parent) && t.isMemberExpression(parent.left) ? parent.left.property : undefined;
          if (resource && ((t.isIdentifier(resource) && ["src", "href", "poster"].includes(resource.name))
            || (t.isStringLiteral(resource) && ["src", "href", "poster"].includes(resource.value)))) {
            references.push({ value: node.node.value, replace: value => node.replaceWith(t.stringLiteral(value)) });
          }
        },
        CallExpression: node => {
          const callee = node.node.callee;
          if (!t.isIdentifier(callee, { name: "fetch" })) return;
          const argument = node.get("arguments.0");
          if (Array.isArray(argument)) return;
          if (t.isNewExpression(argument.node) && t.isIdentifier(argument.node.callee, { name: "URL" })) return;
          const evaluated = argument.evaluate();
          if (!evaluated.confident || typeof evaluated.value !== "string") throw new Error(`Cannot export computed fetch URL in ${filename}. Use a static local URL or embed the data.`);
          references.push({ value: evaluated.value, replace: value => argument.replaceWith(t.stringLiteral(value)) });
        },
        NewExpression: node => {
          if (!t.isIdentifier(node.node.callee, { name: "URL" }) || !t.isStringLiteral(node.node.arguments[0])) return;
          const [resource, base] = node.node.arguments;
          const value = t.isStringLiteral(base) ? new URL(resource.value, base.value).href : resource.value;
          references.push({ value, replace: value => node.replaceWith(t.newExpression(t.identifier("URL"), [t.stringLiteral(value)])) });
        },
      });
      for (const item of references) item.replace(await this.reference(item.value, filename, true));
      return transformFromAstSync(tree, code, { babelrc: false, configFile: false })!.code!;
    };
    const result = await build({ stdin: { contents: await prepare(source, file), loader: "js", resolveDir: path.dirname(file), sourcefile: file },
      bundle: true, format: "iife", platform: "browser", target: "es2022", outfile: "script.js", write: false, logLevel: "silent",
      plugins: [{ name: "offline-script", setup: api => {
        api.onResolve({ filter: /^https?:\/\// }, args => { throw new Error(`Remote script import cannot be bundled offline in ${file}: ${args.path}`); });
        api.onResolve({ filter: /^\./ }, async args => {
          const target = path.resolve(args.resolveDir, args.path);
          await this.validate(target);
          if (isAsset(target) && !/\.(?:[cm]?js|json|css)$/i.test(target)) return { path: await this.dataURL(target), namespace: "offline-data" };
        });
        api.onLoad({ filter: /.*/, namespace: "offline-data" }, args => ({ contents: `export default ${JSON.stringify(args.path)}`, loader: "js" }));
        api.onLoad({ filter: /\.css$/ }, async args => ({ contents: await this.css(await fs.readFile(args.path, "utf8"), args.path), loader: "css" }));
        api.onLoad({ filter: /\.[cm]?js$/ }, async args => {
          await this.validate(args.path);
          return { contents: await prepare(await fs.readFile(args.path, "utf8"), args.path), loader: "js" };
        });
      } }] });
    const css = result.outputFiles.find(output => output.path.endsWith(".css"));
    const script = result.outputFiles.find(output => output.path.endsWith(".js"))!.text;
    return css ? `(()=>{const style=document.createElement("style");style.textContent=${JSON.stringify(css.text)};document.head.append(style);})();\n${script}` : script;
  }
}
