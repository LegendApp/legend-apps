import { Text, View } from "react-native";

function inline(text: string, color: string) {
  const safe = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  return safe.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => {
    const bold = part.startsWith("**"), code = part.startsWith("`"), italic = !bold && part.startsWith("*");
    return <Text key={index} style={{ color, fontWeight: bold ? "600" : "400", fontStyle: italic ? "italic" : "normal", fontFamily: code ? "Menlo" : undefined }}>{bold ? part.slice(2, -2) : code || italic ? part.slice(1, -1) : part}</Text>;
  });
}

// Only native text is emitted: HTML, URLs and commands never become executable content.
export function StoryDescription({ markdown, color }: { markdown: string; color: string }) {
  let fenced = false;
  return <View className="gap-1">{markdown.split(/\r?\n/).map((line, index) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return null; }
    const heading = /^(#{1,6})\s+(.*)/.exec(line);
    const bullet = /^\s*(?:[-*+]\s+|\d+\.\s+)(.*)/.exec(line);
    return <Text key={index} selectable style={{ color, fontSize: 13, lineHeight: 19, fontWeight: heading ? "600" : "400", fontFamily: fenced ? "Menlo" : undefined }}>{fenced ? line : inline(heading?.[2] ?? (bullet ? `• ${bullet[1]}` : line), color)}</Text>;
  })}</View>;
}
