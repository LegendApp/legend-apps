import { parseDocument } from "yaml";

export type QuestionAnswer = string | string[];
export type QuestionData = {
  id: string;
  prompt: string;
  type: "single" | "multi" | "text";
  options?: string[];
  allowOther?: boolean;
  answer?: QuestionAnswer;
  answeredAt?: string;
};

export function parseQuestion(body: string): QuestionData {
  const document = parseDocument(body);
  if (document.errors.length) throw new Error(document.errors[0]!.message.split("\n")[0]);
  const data = document.toJS({ maxAliasCount: 0 });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("expected a JSON or YAML object");
  for (const key of ["id", "prompt"] as const) {
    if (typeof data[key] !== "string" || !data[key].trim()) throw new Error(`${key} must be a non-empty string`);
  }
  const type = data.type ?? "single";
  if (type !== "single" && type !== "multi" && type !== "text") throw new Error("type must be single, multi, or text");
  if (type !== "text" && (!Array.isArray(data.options) || !data.options.length || data.options.some((option: unknown) => typeof option !== "string" || !option.trim()))) {
    throw new Error("options must be a non-empty array of strings");
  }
  if (data.options && (!Array.isArray(data.options) || data.options.some((option: unknown) => typeof option !== "string"))) throw new Error("options must be an array of strings");
  if (data.options && new Set(data.options).size !== data.options.length) throw new Error("options must be unique");
  if (data.allowOther !== undefined && typeof data.allowOther !== "boolean") throw new Error("allowOther must be a boolean");
  const question: QuestionData = { id: data.id, prompt: data.prompt, type, options: data.options, allowOther: data.allowOther };
  if (data.answer !== undefined && data.answer !== null && data.answer !== "" && !(Array.isArray(data.answer) && data.answer.length === 0)) {
    validateQuestionAnswer(question, data.answer);
    question.answer = data.answer;
  }
  if (data.answeredAt !== undefined && typeof data.answeredAt !== "string") throw new Error("answeredAt must be a string");
  question.answeredAt = data.answeredAt;
  return question;
}

export function validateQuestionAnswer(question: QuestionData, answer: QuestionAnswer) {
  if (question.type === "multi") {
    if (!Array.isArray(answer) || answer.some((value) => typeof value !== "string") || new Set(answer).size !== answer.length) throw new Error("answer must be an array of unique strings");
  } else if (typeof answer !== "string") throw new Error("answer must be a string");
  if (question.type !== "text" && !question.allowOther) {
    const answers = Array.isArray(answer) ? answer : [answer];
    if (answers.some((value) => !question.options!.includes(value))) throw new Error("answer must match an option");
  }
}

// Scan complete fences, skipping ordinary code so examples cannot receive answers.
export function questionFences(markdown: string) {
  const fences: Array<{ body: string; start: number; end: number }> = [];
  const lines = [...markdown.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)].filter((line) => line[0]);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const open = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)/.exec(line[0]);
    if (!open) continue;
    const closePattern = new RegExp(`^ {0,3}${open[1]![0]}{${open[1]!.length},}[ \\t]*(?:\\r?\\n|\\r)?$`);
    const bodyStart = line.index! + line[0].length;
    for (index++; index < lines.length; index++) {
      const close = lines[index]!;
      if (closePattern.test(close[0])) {
        if (open[2]!.trim() === "question") fences.push({ body: markdown.slice(bodyStart, close.index), start: bodyStart, end: close.index! });
        break;
      }
    }
  }
  return fences;
}

