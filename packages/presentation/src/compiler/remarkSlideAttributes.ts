import { parseAttributes, registerAttributeSyntax, type AttributeValues } from "./slideAttributes";

type Node = {
  type: string;
  value?: string;
  children?: Node[];
  [key: string]: unknown;
};

function attribute(name: string, value: string | number) {
  return { type: "mdxJsxAttribute", name, value: typeof value === "string" ? value : {
    type: "mdxJsxAttributeValueExpression", value: String(value),
    data: { estree: { type: "Program", sourceType: "module", body: [
      { type: "ExpressionStatement", expression: { type: "Literal", value, raw: String(value) } },
    ] } },
  } };
}
function wrap(name: string, props: Record<string, string | number>, child: Node): Node {
  return { type: "mdxJsxFlowElement", name,
    attributes: Object.entries(props).map(([key, value]) => attribute(key, value)), children: [child] };
}
function identifier(value: string | true, name: string) {
  if (typeof value !== "string" || !/^[\w.-]+$/.test(value)) throw new Error(`${name} requires an identifier.`);
  return value;
}
function stepNumber(value: string | true, name: string) {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number)) throw new Error(`${name} requires a non-negative integer.`);
  return number;
}
function apply(node: Node, values: AttributeValues) {
  if (values.shared !== undefined) node = wrap("SharedElement", { id: identifier(values.shared, "shared") }, node);
  if (values.step !== undefined || values.until !== undefined) {
    const at = values.step === undefined ? 0 : stepNumber(values.step, "step");
    const until = values.until === undefined ? undefined : stepNumber(values.until, "until");
    if (until !== undefined && until <= at) throw new Error("until must be greater than step.");
    node = wrap("Step", { at, ...(until === undefined ? {} : { until }) }, node);
  }
  return node;
}

export function remarkSlideAttributes(this: { data(): object }) {
  registerAttributeSyntax(this.data() as Record<string, unknown>);
  return (root: Node) => {
    const visit = (parent: Node) => {
      parent.children = parent.children?.map((node) => {
        if ((node.type === "heading" || node.type === "paragraph") && parent.type !== "listItem") {
          const children = [...(node.children ?? [])];
          while (children.at(-1)?.type === "text" && !children.at(-1)?.value?.trim()) children.pop();
          const last = children.at(-1);
          if (last?.type === "slideAttributes") {
            children.pop();
            const trailing = children.at(-1);
            if (trailing?.type === "text") trailing.value = trailing.value?.trimEnd();
            if (!children.some((child) => child.type !== "text" || child.value?.trim())) {
              throw new Error("Slide attributes must follow content at the end of a heading or paragraph.");
            }
            const content = { ...node, children };
            visit(content);
            return apply(content, parseAttributes(last.value ?? ""));
          }
        }
        if (node.type === "slideAttributes") {
          throw new Error("Use slide attributes at the end of a heading or paragraph, outside a list item.");
        }
        if (node.children) visit(node);
        return node;
      });
    };
    visit(root);
  };
}
