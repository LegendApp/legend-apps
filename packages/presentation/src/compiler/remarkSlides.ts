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
};

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
        continue;
      }
      if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === "SlideFrontmatter") {
        if (nodes.length > 0 || notes.length > 0) {
          pushSlide();
        }
        const encoded = getEncodedAttribute(node);
        metadata = parseFrontmatter(encoded ? Buffer.from(encoded, "base64").toString("utf8") : "", `Slide ${slides.length + 1}`);
        registerTemplate(metadata, `Slide ${slides.length + 1}`, options.templates, true);
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
