import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type Node = {
  type: string;
  children?: Node[];
  url?: string;
  identifier?: string;
  alt?: string;
  title?: string;
  ordered?: boolean;
  start?: number;
  data?: { hProperties?: Record<string, unknown> };
};

/** Resolve Markdown images like other local assets, and preserve list numbering. */
export function remarkNativeMarkdown({ deckPath, dependencies }: { deckPath: string; dependencies: Set<string> }) {
  return (root: Node) => {
    const definitions = new Map<string, Node>();
    const collect = (node: Node) => {
      if (node.type === "definition" && node.identifier) definitions.set(node.identifier.toLowerCase(), node);
      node.children?.forEach(collect);
    };
    collect(root);
    const visit = (node: Node) => {
      if (node.type === "imageReference") {
        const definition = definitions.get(node.identifier?.toLowerCase() ?? "");
        if (definition) Object.assign(node, { type: "image", url: definition.url, title: definition.title });
      }
      if (node.type === "image" && node.url && !/^(https?:|data:)/i.test(node.url)) {
        const root = fs.realpathSync(path.dirname(deckPath));
        const candidate = path.resolve(root, decodeURIComponent(node.url));
        if (!fs.existsSync(candidate)) throw new Error(`Could not find Markdown image "${node.url}".`);
        const resolved = fs.realpathSync(candidate);
        const relative = path.relative(root, resolved);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error(`Markdown image "${node.url}" escapes the deck directory.`);
        }
        if (!fs.statSync(resolved).isFile()) throw new Error(`Markdown image "${node.url}" must be a file.`);
        dependencies.add(resolved);
        node.url = pathToFileURL(resolved).href;
      }
      if (node.type === "list") {
        node.children?.forEach((item, index) => {
          item.data = { ...item.data, hProperties: { ...item.data?.hProperties,
            marker: node.ordered ? `${(node.start ?? 1) + index}.` : "•" } };
        });
      }
      node.children?.forEach(visit);
    };
    visit(root);
  };
}
