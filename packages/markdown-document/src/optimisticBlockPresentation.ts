import type { MarkdownBlockSnapshot } from "./types";

type OptimisticBlockPresentation = Pick<MarkdownBlockSnapshot, "depth" | "headingLevel" | "type">;

function splitMarkdownLines(markdown: string) {
  return markdown.split(/\r\n|\r|\n/);
}

function optimisticMarkdownDepth(markdown: string) {
  const firstLine = splitMarkdownLines(markdown)[0] ?? "";
  const match = /^(\s*)/.exec(firstLine);
  return Math.floor((match?.[1].replace(/\t/g, "    ").length ?? 0) / 2);
}

function optimisticMarkdownHeadingLevel(markdown: string) {
  const firstLine = splitMarkdownLines(markdown)[0] ?? "";
  const match = /^(#{1,6})\s/.exec(firstLine);
  return match ? match[1]!.length : 0;
}

function optimisticMarkdownBlockType(markdown: string) {
  const lines = splitMarkdownLines(markdown);
  const firstLine = lines[0] ?? "";
  if (/^#{1,6}\s/.test(firstLine)) {
    return "heading";
  }
  if (/^\s*(```|~~~)/.test(firstLine)) {
    return "codeBlock";
  }
  if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(firstLine)) {
    return "thematicBreak";
  }
  if (/^\s*\d+\.\s/.test(firstLine)) {
    return "orderedList";
  }
  if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(firstLine)) {
    return "unorderedList";
  }
  if (/^\s*[-*+]\s/.test(firstLine)) {
    return "unorderedList";
  }
  if (/^\s*>/.test(firstLine)) {
    return "quote";
  }
  if (lines.length > 1 && /\|/.test(firstLine) && /^\s*\|?[\s:-]+\|/.test(lines[1] ?? "")) {
    return "table";
  }
  return "paragraph";
}

export function resolveOptimisticBlockPresentation(markdown: string): OptimisticBlockPresentation {
  return {
    depth: optimisticMarkdownDepth(markdown),
    headingLevel: optimisticMarkdownHeadingLevel(markdown),
    type: optimisticMarkdownBlockType(markdown),
  };
}
