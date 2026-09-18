import { transitionReference } from "./transitionLibrary";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

type Node = {
  attributes?: Node[];
  children?: Node[];
  name?: string;
  type: string;
  value?: string;
  [key: string]: unknown;
};

type RemarkSlidesOptions = {
  templates?: Map<string, string>;
  transitions?: Set<string>;
  deckPath?: string;
  dependencies?: Set<string>;
};

function resolveBackground(config: Record<string, unknown>, label: string, options: RemarkSlidesOptions) {
  const reference = config.background;
  if (reference === undefined || reference === false) return;
  if (typeof reference !== "string" || !reference.trim() || !options.deckPath) {
    throw new Error(`${label} background must be a deck-relative image path or false.`);
  }
  if (path.isAbsolute(reference) || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(reference)) {
    throw new Error(`${label} background must be relative to the deck file.`);
  }
  const root = fs.realpathSync(path.dirname(options.deckPath));
  const candidate = path.resolve(root, reference);
  if (!fs.existsSync(candidate)) throw new Error(`Could not find background image "${reference}".`);
  const resolved = fs.realpathSync(candidate);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Background image "${reference}" escapes the deck directory.`);
  }
  if (!fs.statSync(resolved).isFile() || !/\.(png|jpe?g|gif|webp)$/i.test(resolved)) {
    throw new Error(`Background "${reference}" must be a PNG, JPEG, GIF, or WebP image.`);
  }
  options.dependencies?.add(resolved);
  config.background = pathToFileURL(resolved).href;
}

function registerTemplate(
  config: Record<string, unknown>,
  label: string,
  templates: Map<string, string> | undefined,
  allowDisabled: boolean,
) {
  const reference = config.template;
  if (reference === undefined || (allowDisabled && reference === false)) {
    return;
  }
  if (typeof reference !== "string" || !reference.trim()) {
    throw new Error(`${label} template must be a local file name or path${allowDisabled ? ", or false" : ""}.`);
  }
  if (reference.startsWith("/") || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(reference)) {
    throw new Error(`${label} template must be relative to the deck file.`);
  }
  const importPath = reference.startsWith(".") ? reference : `./${reference}`;
  templates?.set(reference, importPath);
}

function parseFrontmatter(value: string | undefined, label: string) {
  if (!value?.trim()) {
    return {};
  }
  const parsed = parseYaml(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} frontmatter must be a YAML object.`);
  }
  return parsed as Record<string, unknown>;
}

function extractNotes(node: Node, notes: string[]): Node | undefined {
  if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === "PresenterNote") {
    const encoded = node.attributes?.find((attribute) => attribute.name === "encoded")?.value;
    if (typeof encoded === "string") {
      notes.push(Buffer.from(encoded, "base64").toString("utf8"));
    }
    return undefined;
  }
  if (node.type === "html" && typeof node.value === "string") {
    const remaining = node.value.replace(/<!--([\s\S]*?)-->/g, (_match, note: string) => {
      notes.push(note.trim());
      return "";
    });
    if (!remaining.trim()) {
      return undefined;
    }
    return { ...node, value: remaining };
  }

  if (!node.children) {
    return node;
  }

  return {
    ...node,
    children: node.children.map((child) => extractNotes(child, notes)).filter(Boolean) as Node[],
  };
}

function getEncodedAttribute(node: Node) {
  const encoded = node.attributes?.find((attribute) => attribute.name === "encoded")?.value;
  return typeof encoded === "string" ? encoded : undefined;
}

function stringAttribute(name: string, value: string): Node {
  return {
    type: "mdxJsxAttribute",
    name,
    value,
  };
}

export function remarkSlides(options: RemarkSlidesOptions = {}) {
  return (root: Node) => {
    const moduleNodes = root.children?.filter((node) => node.type === "mdxjsEsm") ?? [];
    const contentNodes = root.children?.filter((node) => node.type !== "mdxjsEsm") ?? [];
    const firstNode = contentNodes[0];
    const deckConfig = firstNode?.type === "yaml"
      ? parseFrontmatter(firstNode.value, "Deck")
      : {};
    registerTemplate(deckConfig, "Deck", options.templates, false);
    resolveBackground(deckConfig, "Deck", options);
    const registerTransition = (config: Record<string, unknown>) => {
      const value = config.transition;
      const reference = transitionReference(value);
      if (value !== undefined && !(value && typeof value === "object" && "type" in value && value.type === "focus")) {
        if (!reference || (typeof value === "object" && value && "name" in value && "source" in value)) throw new Error("A transition must have one name or source.");
        if (typeof value === "object" && value) {
          if ("duration" in value && (typeof value.duration !== "number" || !Number.isFinite(value.duration) || value.duration < 0 || value.duration > 10000)) throw new Error("Transition duration must be between 0 and 10000 ms.");
          if ("options" in value && (!value.options || typeof value.options !== "object" || Array.isArray(value.options))) throw new Error("Transition options must be an object.");
        }
        if (reference !== "none") options.transitions?.add(reference);
      }
    };
    registerTransition(deckConfig);
    const slideSource = firstNode?.type === "yaml" ? contentNodes.slice(1) : contentNodes;

    const slides: Array<{ metadata: Record<string, unknown>; nodes: Node[]; notes: string[] }> = [];
    let metadata: Record<string, unknown> = {};
    let nodes: Node[] = [];
    let notes: string[] = [];

    const pushSlide = () => {
      slides.push({ metadata, nodes, notes });
      metadata = {};
      nodes = [];
      notes = [];
    };

    for (const node of slideSource) {
      if (node.type === "thematicBreak") {
        pushSlide();
        continue;
      }
      if (node.type === "yaml") {
        if (nodes.length > 0 || notes.length > 0) {
          pushSlide();
        }
        metadata = parseFrontmatter(node.value, `Slide ${slides.length + 1}`);
        registerTemplate(metadata, `Slide ${slides.length + 1}`, options.templates, true);
        resolveBackground(metadata, `Slide ${slides.length + 1}`, options);
        registerTransition(metadata);
        continue;
      }
      if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === "SlideFrontmatter") {
        if (nodes.length > 0 || notes.length > 0) {
          pushSlide();
        }
        const encoded = getEncodedAttribute(node);
        metadata = parseFrontmatter(encoded ? Buffer.from(encoded, "base64").toString("utf8") : "", `Slide ${slides.length + 1}`);
        registerTemplate(metadata, `Slide ${slides.length + 1}`, options.templates, true);
        resolveBackground(metadata, `Slide ${slides.length + 1}`, options);
        registerTransition(metadata);
        continue;
      }
      const nextNode = extractNotes(node, notes);
      if (nextNode) {
        nodes.push(nextNode);
      }
    }

    if (nodes.length > 0 || notes.length > 0 || slides.length === 0) {
      pushSlide();
    }

    const deckNode: Node = {
      type: "mdxJsxFlowElement",
      name: "Deck",
      attributes: [stringAttribute("configJson", JSON.stringify(deckConfig))],
      children: slides.map((slide, index) => ({
        type: "mdxJsxFlowElement",
        name: "Slide",
        attributes: [
          stringAttribute("index", String(index)),
          stringAttribute("metadataJson", JSON.stringify(slide.metadata)),
          stringAttribute("notes", slide.notes.join("\n\n")),
        ],
        children: slide.nodes,
      })),
    };

    root.children = [...moduleNodes, deckNode];
  };
}
