export type AttributeValues = Record<string, string | true>;
export const blockAttributes = new Set(["shared", "step", "until", "steps", "focus", "effect", "class"]);

export function parseAttributes(source: string): AttributeValues {
  const values: AttributeValues = {};
  let rest = source.trim();
  while (rest) {
    const match = /^([a-z][\w-]*)(?:\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\w.-]+))?(?:\s+|$)/.exec(rest);
    if (!match) throw new Error(`Invalid slide attributes: ${source}`);
    const [, key, raw] = match;
    if (!blockAttributes.has(key)) throw new Error(`Unknown slide attribute "${key}".`);
    if (key in values) throw new Error(`Duplicate slide attribute "${key}".`);
    values[key] = raw === undefined ? true : raw.startsWith('"') ? JSON.parse(raw)
      : raw.startsWith("'") ? raw.slice(1, -1).replace(/\\(['\\])/g, "$1") : raw;
    rest = rest.slice(match[0].length);
  }
  return values;
}

// Read attributes before MDX's JavaScript parser: multiple attributes aren't JS.
// Micromark handles code spans, fences, escaped braces, JSX and comments itself.
type Code = number | null;
type State = (code: Code) => State | undefined;
type Effects = { enter(type: string): void; exit(type: string): void; consume(code: number): void };
function tokenize(effects: Effects, ok: State, nok: State): State {
  let source = "";
  let quote = 0;
  let escaped = false;
  return (code) => {
    effects.enter("slideAttributes");
    effects.consume(code!);
    return inside;
  };
  function inside(code: Code): State | undefined {
    if (code === null || code < 0) return nok(code);
    if (!quote && code === 125) {
      const first = /^([a-z][\w-]*)([\s\S]*)$/.exec(source.trim());
      if (!first || !blockAttributes.has(first[1]) ||
          (first[2].trim() && !/^\s*=(?!=|>)/.test(first[2]) && first[1] !== "steps")) return nok(code);
      effects.consume(code);
      effects.exit("slideAttributes");
      return ok;
    }
    if (!quote && code === 123) return nok(code);
    source += String.fromCharCode(code);
    if (escaped) escaped = false;
    else if (quote && code === 92) escaped = true;
    else if (quote === code) quote = 0;
    else if (!quote && (code === 34 || code === 39)) quote = code;
    effects.consume(code);
    return inside;
  }
}

type Token = { type: string };
type CompileContext = {
  enter(node: { type: string; value: string }, token: Token): void;
  exit(token: Token): void;
  sliceSerialize(token: Token): string;
};
export function registerAttributeSyntax(data: Record<string, unknown>) {
  const construct = { name: "slideAttributes", tokenize };
  const syntax = { text: { 123: construct }, flow: { 123: { ...construct, concrete: true } } };
  const fromMarkdown = {
    enter: { slideAttributes(this: CompileContext, token: Token) {
      this.enter({ type: "slideAttributes", value: this.sliceSerialize(token).slice(1, -1) }, token);
    } },
    exit: { slideAttributes(this: CompileContext, token: Token) { this.exit(token); } },
  };
  ((data.micromarkExtensions ??= []) as unknown[]).push(syntax);
  ((data.fromMarkdownExtensions ??= []) as unknown[]).push(fromMarkdown);
}
