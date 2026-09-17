type Node = {
  type: string;
  value?: string;
  children?: Node[];
  [key: string]: unknown;
};

/** MDX parses {shared=title} as an expression; consume it before code generation. */
export function remarkShared() {
  return (root: Node) => {
    const visit = (parent: Node) => {
      parent.children = parent.children?.map((node) => {
        if ((node.type === "heading" || node.type === "paragraph") && parent.type !== "listItem") {
          const children = node.children ?? [];
          const last = children.at(-1);
          const match = last?.type === "mdxTextExpression"
            ? /^shared\s*=\s*(?:"([\w.-]+)"|'([\w.-]+)'|([\w.-]+))\s*$/.exec(last.value?.trim() ?? "")
            : null;
          if (match) {
            const content = children.slice(0, -1);
            const trailing = content.at(-1);
            if (trailing?.type === "text") trailing.value = trailing.value?.trimEnd();
            if (!content.some((child) => child.type !== "text" || child.value?.trim())) {
              throw new Error("A shared attribute must follow heading or paragraph content.");
            }
            return {
              type: "mdxJsxFlowElement", name: "SharedElement",
              attributes: [{ type: "mdxJsxAttribute", name: "id", value: match[1] ?? match[2] ?? match[3] }],
              children: [{ ...node, children: content }],
            };
          }
        }
        if ((node.type === "mdxTextExpression" || node.type === "mdxFlowExpression") &&
            /^shared\s*=/.test(node.value?.trim() ?? "")) {
          throw new Error("Use {shared=identifier} at the end of a heading or paragraph, outside a list item.");
        }
        if (node.children) visit(node);
        return node;
      });
    };
    visit(root);
  };
}
