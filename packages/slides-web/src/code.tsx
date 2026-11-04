import type { CodeHighlight } from "@legend-apps/presentation";

export function CodeBlock({ source, highlighted }: { source: string; highlighted?: CodeHighlight }) {
  const last = highlighted?.tokens.at(-1);
  return <pre style={{ fontSize: 30, color: highlighted?.foreground ?? "#e2e8f0", backgroundColor: highlighted?.background, whiteSpace: "pre-wrap" }}>
    {highlighted ? highlighted.tokens.map((token, index) => <span key={token.id} style={{ color: token.color }}>
      {source.slice(index === 0 ? 0 : highlighted.tokens[index - 1].offset + highlighted.tokens[index - 1].content.length, token.offset)}
      {token.content}
    </span>) : source}
    {highlighted ? source.slice(last ? last.offset + last.content.length : 0) : null}
  </pre>;
}
