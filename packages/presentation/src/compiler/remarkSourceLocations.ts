import path from "node:path";

type Node = { type: string; name?: string | null; children?: Node[]; attributes?: unknown[]; position?: { start: { line: number; column: number } };
  data?: { estree?: { body: { type: string; source?: { value: unknown }; specifiers?: { local: { name: string } }[] }[] } } };

/** Pack authoring modules (`slides:<pack>/Authoring`) read declarations instead of mounting them, so their errors can't point at a React stack.
 * Their MDX elements get `mdxSource="deck.mdx:line"`, in the author's original lines, for those errors to name. */
export function remarkSourceLocations({ deckPath, originalLine }: { deckPath: string; originalLine(line: number, column: number): number | undefined }) {
  const file = path.basename(deckPath);
  return () => (tree: Node) => {
    const names = new Set<string>();
    for (const node of tree.children ?? []) if (node.type === "mdxjsEsm") for (const statement of node.data?.estree?.body ?? []) {
      const source = statement.type === "ImportDeclaration" ? statement.source?.value : undefined;
      if (typeof source === "string" && /^slides:[^/]+\/Authoring$/.test(source)) for (const specifier of statement.specifiers ?? []) names.add(specifier.local.name);
    }
    if (!names.size) return;
    const visit = (node: Node) => {
      if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name && names.has(node.name) && node.position) {
        const line = originalLine(node.position.start.line, node.position.start.column);
        if (line !== undefined) node.attributes = [...node.attributes ?? [], { type: "mdxJsxAttribute", name: "mdxSource", value: `${file}:${line}` }];
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
