import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { bundledLanguages, createHighlighter, type BundledLanguage } from "shiki";
import shikiPackage from "shiki/package.json";
import type { CodeHighlight } from "../codeHighlight";

const theme = "github-dark-default";
export const codeHighlightVersion = `shiki@${shikiPackage.version}/${theme}/1`;
let highlighter: ReturnType<typeof createHighlighter> | undefined;

export async function highlightCode(source: string, language = "text"): Promise<CodeHighlight> {
  const directory = process.env.LEGEND_SLIDES_TRANSFORM_CACHE ?? path.join(os.tmpdir(), "legend-slides-transforms");
  const key = createHash("sha256").update(JSON.stringify([codeHighlightVersion, language, source])).digest("hex");
  const file = directory ? path.join(directory, "code", `${key}.cache`) : undefined;
  if (file) {
    try {
      const cached = fs.readFileSync(file, "utf8"), end = cached.indexOf("\n");
      const json = cached.slice(end + 1);
      if (cached.slice(0, end) === createHash("sha256").update(json).digest("hex")) return JSON.parse(json);
    } catch { /* Missing or damaged entries are rebuilt. */ }
  }
  const shiki = await (highlighter ??= createHighlighter({ themes: [theme], langs: [] }));
  const lang = Object.hasOwn(bundledLanguages, language.toLowerCase()) ? language.toLowerCase() as BundledLanguage : "text";
  if (lang !== "text") await shiki.loadLanguage(lang);
  const result = shiki.codeToTokens(source, { lang, theme });
  const { fg: foreground, bg: background } = shiki.getTheme(theme);
  const counts = new Map<string, number>();
  const highlighted: CodeHighlight = { version: codeHighlightVersion, foreground, background,
    tokens: result.tokens.flatMap(line => line.map(token => {
      const color = token.color ?? foreground, identity = JSON.stringify([token.content, color]);
      const occurrence = counts.get(identity) ?? 0;
      counts.set(identity, occurrence + 1);
      return { content: token.content, color, offset: token.offset, id: `${identity}:${occurrence}` };
    })) };
  if (file) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const json = JSON.stringify(highlighted);
      fs.writeFileSync(temporary, `${createHash("sha256").update(json).digest("hex")}\n${json}`);
      fs.renameSync(temporary, file);
      const entries = fs.readdirSync(path.dirname(file)).filter(name => name.endsWith(".cache"));
      if (entries.length > 256) {
        const oldest = entries.map(name => ({ name, time: fs.statSync(path.join(path.dirname(file), name), { throwIfNoEntry: false })?.mtimeMs ?? 0 })).sort((a, b) => a.time - b.time);
        for (const entry of oldest.slice(0, entries.length - 256)) fs.rmSync(path.join(path.dirname(file), entry.name), { force: true });
      }
    } catch { /* Cache storage is optional. */ }
    finally { try { fs.rmSync(temporary, { force: true }); } catch {} }
  }
  return highlighted;
}

type Node = { type: string; value?: string; lang?: string; children?: Node[]; [key: string]: unknown };
function expression(value: unknown): object {
  if (Array.isArray(value)) return { type: "ArrayExpression", elements: value.map(expression) };
  if (value && typeof value === "object") return { type: "ObjectExpression", properties: Object.entries(value).map(([key, value]) => ({
    type: "Property", kind: "init", method: false, shorthand: false, computed: false,
    key: { type: "Literal", value: key }, value: expression(value),
  })) };
  return { type: "Literal", value };
}
function expressionValue(value: unknown) {
  return { value: JSON.stringify(value), data: { estree: { type: "Program", sourceType: "module",
    body: [{ type: "ExpressionStatement", expression: expression(value) }] } } };
}
function attribute(name: string, value: unknown) {
  return { type: "mdxJsxAttribute", name, value: { type: "mdxJsxAttributeValueExpression", ...expressionValue(value) } };
}

export function remarkCodeHighlight() {
  return async (root: Node) => {
    async function visit(node: Node): Promise<void> {
      if (node.type === "code") {
        const source = node.value ?? "", highlighted = await highlightCode(source, node.lang ?? undefined);
        Object.assign(node, { type: "mdxJsxFlowElement", name: "pre", attributes: [], children: [{
          type: "mdxJsxFlowElement", name: "code", attributes: [attribute("highlighted", highlighted),
            ...node.lang ? [attribute("className", `language-${node.lang}`)] : []], children: [{ type: "mdxFlowExpression", ...expressionValue(`${source}\n`) }],
        }] });
      } else if (node.children) {
        for (const child of node.children) await visit(child);
      }
    }
    await visit(root);
  };
}
