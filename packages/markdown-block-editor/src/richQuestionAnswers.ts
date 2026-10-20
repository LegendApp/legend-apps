import { isMap, isScalar, parseDocument } from "yaml";
import { parseQuestion, questionFences, validateQuestionAnswer, type QuestionAnswer } from "./richQuestions";

export function writeQuestionAnswer(markdown: string, id: string, answer: QuestionAnswer, answeredAt = new Date().toISOString()): string {
  const matches = questionFences(markdown).filter(({ body }) => {
    try {
      const data = parseDocument(body).toJS({ maxAliasCount: 0 });
      return data && typeof data === "object" && data.id === id;
    } catch {
      return false;
    }
  });
  if (matches.length !== 1) throw new Error(matches.length ? `Question id must be unique: ${id}` : `Question not found: ${id}`);
  const fence = matches[0]!;
  const question = parseQuestion(fence.body);
  validateQuestionAnswer(question, answer);
  const document = parseDocument(fence.body);
  if (!isMap(document.contents)) throw new Error("Question must be an object");
  const newline = fence.body.includes("\r\n") ? "\r\n" : "\n";
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const flow = document.contents.flow;
  const additions: string[] = [];
  const firstKey = document.contents.items[0]?.key;
  const keyStart = isScalar(firstKey) ? firstKey.range?.[0] ?? 0 : 0;
  const indent = /^[ \t]*/.exec(fence.body.slice(fence.body.lastIndexOf("\n", keyStart - 1) + 1, keyStart))?.[0] ?? "";
  for (const [key, value] of [["answer", answer], ["answeredAt", answeredAt]] as const) {
    const pair = document.contents.items.find((item) => isScalar(item.key) && item.key.value === key);
    const node = pair?.value;
    const blockText = key === "answer" && question.type === "text" && !flow;
    let text = JSON.stringify(value);
    if (blockText) {
      const content = String(value).replace(/\r\n|\r/g, "\n");
      const commentSource = node && "range" in node && node.range
        ? fence.body.slice(isScalar(node) && (node.type === "BLOCK_LITERAL" || node.type === "BLOCK_FOLDED") ? node.range[0] : node.range[1], node.range[2])
        : "";
      const commentMatch = /[ \t]*#[^\r\n]*/.exec(commentSource.split(/\r?\n/, 1)[0] ?? "")?.[0];
      const comment = commentMatch ? (commentMatch.startsWith("#") ? " " + commentMatch : commentMatch) : "";
      const indicator = content.endsWith("\n\n") ? "|4+" : content.endsWith("\n") ? "|4" : "|4-";
      text = `${indicator}${comment}${newline}${content.replace(/\n$/, "").split("\n").map((line) => `${indent}    ${line}`).join(newline)}${newline}`;
    }
    if (node && "range" in node && node.range) {
      const empty = isScalar(node) && node.value === null;
      const prefix = empty && !/[ \t]/.test(fence.body[node.range[0] - 1] ?? "") ? " " : "";
      const suffix = empty && fence.body[node.range[1]] === "#" && !blockText ? " " : "";
      let end = blockText ? node.range[2] : node.range[1];
      if (blockText && empty && node.range[2] === node.range[1]) end += /^(?:\r\n|\n|\r)/.exec(fence.body.slice(end))?.[0].length ?? 0;
      if (!blockText && isScalar(node) && (node.type === "BLOCK_LITERAL" || node.type === "BLOCK_FOLDED")) text += newline;
      edits.push({ start: node.range[0], end, text: prefix + text + suffix });
    } else if (pair && isScalar(pair.key) && pair.key.range) {
      edits.push({ start: pair.key.range[1] + 1, end: pair.key.range[1] + 1, text: ` ${text}` });
    } else additions.push(`${flow ? JSON.stringify(key) : indent + key}: ${text}`);
  }
  if (additions.length) {
    if (flow) {
      const end = document.contents.range![1] - 1;
      edits.push({ start: end, end, text: `${document.contents.items.length ? ", " : ""}${additions.join(", ")}` });
    } else {
      const end = fence.body.length;
      const addedFields = additions.reduce((text, field) => text + (text && !text.endsWith(newline) ? newline : "") + field, "");
      edits.push({ start: end, end, text: `${fence.body.endsWith(newline) ? "" : newline}${addedFields}${addedFields.endsWith(newline) ? "" : newline}` });
    }
  }
  let body = fence.body;
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
  return markdown.slice(0, fence.start) + body + markdown.slice(fence.end);
}
