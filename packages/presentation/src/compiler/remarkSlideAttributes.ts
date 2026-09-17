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
  if (values.class !== undefined) {
    if (typeof values.class !== "string" || !values.class.trim()) throw new Error("class requires a non-empty quoted class list.");
    if (node.type !== "heading" && node.type !== "paragraph") throw new Error("class attributes apply to headings and paragraphs.");
    const data = node.data as { hProperties?: Record<string, unknown> } | undefined;
    node = { ...node, data: { ...data, hProperties: { ...data?.hProperties, className: values.class } } };
  }
  if (values.steps !== undefined) {
    if (values.steps !== true || node.type !== "list") throw new Error("Use {steps} on a line before a Markdown list.");
    if (values.step !== undefined || values.until !== undefined) throw new Error("steps cannot be combined with step or until.");
    node = wrap("Steps", {}, node);
  }
  if (values.effect !== undefined) {
    if (typeof values.effect !== "string" || !["liquid", "ripple", "glitch", "pixelate"].includes(values.effect)) {
      throw new Error("effect must be liquid, ripple, glitch, or pixelate.");
    }
    node = wrap("Effect", { preset: values.effect }, node);
  }
  if (values.shared !== undefined) node = wrap("SharedElement", { id: identifier(values.shared, "shared") }, node);
  if (values.focus !== undefined) node = wrap("FocusRegion", { id: identifier(values.focus, "focus") }, node);
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
      let consumed = -1;
      parent.children = parent.children?.flatMap((node, index, siblings) => {
        if (index === consumed) return [];
        if (node.type === "slideAttributes") {
          const values = parseAttributes(node.value ?? "");
          if (values.steps !== undefined) {
            const list = siblings[index + 1];
            if (!list || list.type !== "list") throw new Error("Use {steps} on a line before a Markdown list.");
            visit(list);
            consumed = index + 1;
            return apply(list, values);
          }
        }
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
