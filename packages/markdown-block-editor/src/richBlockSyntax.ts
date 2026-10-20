const calloutColors = {
  NOTE: "#3b82f6",
  TIP: "#16a34a",
  IMPORTANT: "#a855f7",
  WARNING: "#d97706",
  CAUTION: "#dc2626",
};

export function parseCallout(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
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
  const close = new RegExp(`(?:^|\\r?\\n) {0,3}${marker[0]}{${marker.length},}[ \\t]*(?:\\r?\\n)?$`).exec(markdown.slice(opening[0].length));
  if (!close) return null;
  return { language: opening[2]!.trim(), body: markdown.slice(opening[0].length, opening[0].length + close.index) };
}
