import { parseChart } from "./richCharts";
import { parseQuestion } from "./richQuestions";

const calloutColors = {
  NOTE: "#3b82f6",
  TIP: "#16a34a",
  IMPORTANT: "#a855f7",
  WARNING: "#d97706",
  CAUTION: "#dc2626",
};

export function parseCallout(markdown: string) {
  const lines = markdown.replace(/\r\n|\r/g, "\n").split("\n");
  const marker = /^ {0,3}>[ \t]?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+(.*))?$/i.exec(lines[0] ?? "");
  if (!marker) return null;
  const type = marker[1]!.toUpperCase() as keyof typeof calloutColors;
  return {
    type,
    title: marker[2]?.trim() || type[0] + type.slice(1).toLowerCase(),
    color: calloutColors[type],
    body: lines.slice(1).map((line) => line.replace(/^ {0,3}>[ \t]?/, "")).join("\n"),
  };
}

export function parseRichFence(markdown: string) {
  const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(?:\r\n|\n|\r)/.exec(markdown);
  if (!opening) return null;
  const marker = opening[1]!;
  const close = new RegExp(`(?:^|\\r\\n|\\n|\\r) {0,3}${marker[0]}{${marker.length},}[ \\t]*(?:\\r\\n|\\n|\\r)?$`).exec(markdown.slice(opening[0].length));
  if (!close) return null;
  return { language: opening[2]!.trim(), body: markdown.slice(opening[0].length, opening[0].length + close.index) };
}

export function parseRichBlock(markdown: string, getQuestionError?: (id: string) => string | undefined) {
  const callout = parseCallout(markdown);
  if (callout) return { type: "callout", callout } as const;
  const fence = parseRichFence(markdown);
  try {
    if (fence?.language === "mermaid") return { type: "mermaid", source: fence.body } as const;
    if (fence?.language === "chart") return { type: "chart", chart: parseChart(fence.body) } as const;
    if (fence?.language === "question") {
      const question = parseQuestion(fence.body);
      const error = getQuestionError?.(question.id);
      if (error) throw new Error(error);
      return { type: "question", question } as const;
    }
  } catch (cause) {
    return { type: "error", message: `Invalid ${fence!.language}: ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}` } as const;
  }
  return null;
}
