// @ts-expect-error Bun test types are supplied by the test runner.
import { describe, expect, test } from "bun:test";
import { parseQuestion, questionFences } from "../richQuestions";
import { writeQuestionAnswer } from "../richQuestionAnswers";

const body = "id: release\nprompt: Pick a date\noptions: [Nov 3, Nov 10]\nanswer: # waiting\n";
const wrap = (value: string) => `Before\n\n\`\`\`question\n${value}\`\`\`\n\nAfter\n`;

describe("question answer write-back", () => {
  const timestamp = "2026-10-20T14:30:00-07:00";
  test("preserves surrounding source, comments and formatting", () => {
    const markdown = wrap(body);
    const result = writeQuestionAnswer(markdown, "release", "Nov 10", timestamp);
    expect(result).toBe(wrap(body.replace("answer: # waiting", 'answer: "Nov 10" # waiting') + `answeredAt: "${timestamp}"\n`));
  });
  test("writes multi answers, adds missing fields, and changes existing values", () => {
    const markdown = wrap(body.replace("answer: # waiting\n", "") + "type: multi\n");
    const result = writeQuestionAnswer(markdown, "release", ["Nov 3", "Nov 10"], timestamp);
    expect(parseQuestion(questionFences(result)[0]!.body).answer).toEqual(["Nov 3", "Nov 10"]);
    const changed = writeQuestionAnswer(result, "release", ["Nov 10"], timestamp);
    expect(parseQuestion(questionFences(changed)[0]!.body).answer).toEqual(["Nov 10"]);
    expect(changed.match(/answeredAt:/g)).toHaveLength(1);
  });
  test("writes multiline text and preserves fields after a block scalar", () => {
    const markdown = wrap("id: why\nprompt: Why?\ntype: text\nanswer: |-\n  Old answer\nextra: keep me\n");
    const result = writeQuestionAnswer(markdown, "why", "First\nSecond", timestamp);
    expect(result).toContain("answer: |4-\n    First\n    Second\nextra: keep me\n");
    expect(parseQuestion(questionFences(result)[0]!.body).answer).toBe("First\nSecond");
  });
  test("preserves JSON formatting and unknown fields", () => {
    const markdown = wrap('{ "id": "why", "prompt":"Why?", "type":"text", "custom": 42, "answer": "Old" }\n');
    const result = writeQuestionAnswer(markdown, "why", "New\nAnswer", timestamp);
    expect(result).toContain('"custom": 42, "answer": "New\\nAnswer"');
    expect(parseQuestion(questionFences(result)[0]!.body).answer).toBe("New\nAnswer");
  });
  test("relocates by id after an external edit and rejects duplicate or missing ids", () => {
    expect(writeQuestionAnswer("New heading\n" + wrap(body), "release", "Nov 3", timestamp)).toStartWith("New heading\nBefore");
    expect(() => writeQuestionAnswer(wrap(body) + wrap(body), "release", "Nov 3", timestamp)).toThrow("unique");
    expect(() => writeQuestionAnswer(wrap(body), "missing", "Nov 3", timestamp)).toThrow("not found");
  });
  test("preserves indented YAML and literal header comments", () => {
    const markdown = wrap("  id: why\n  prompt: Why?\n  type: text\n  answer: |- # keep\n    Old\n  extra: untouched\n");
    const result = writeQuestionAnswer(markdown, "why", "New\nLine", timestamp);
    expect(result).toContain("  answer: |4- # keep\n      New\n      Line\n  extra: untouched\n");
    expect(result).toContain(`  answeredAt: "${timestamp}"`);
    expect(parseQuestion(questionFences(result)[0]!.body).answer).toBe("New\nLine");
  });
  test("round-trips leading spaces in free text answers", () => {
    for (const fields of ["answer:\n", "", `answeredAt: "${timestamp}"\n`]) {
      const markdown = wrap("id: why\nprompt: Why?\ntype: text\n" + fields);
      for (const answer of ["  indented first line\nnormal second line", "  all lines indent\n  equally", "\n  spaced\n\n", "Code:\n```\ninside\n```"]) {
        const result = writeQuestionAnswer(markdown, "why", answer, timestamp);
        expect(parseQuestion(questionFences(result)[0]!.body).answer).toBe(answer);
      }
    }
  });
  test("ignores an unrelated invalid question while answering a valid one", () => {
    const markdown = wrap("id: broken\nprompt: Bad\ntype: text\ncustom: *missing\n") + wrap(body);
    expect(writeQuestionAnswer(markdown, "release", "Nov 3", timestamp)).toContain('answer: "Nov 3" # waiting');
  });
  test("preserves CRLF line endings", () => {
    const result = writeQuestionAnswer(wrap(body).replaceAll("\n", "\r\n"), "release", "Nov 10", timestamp);
    expect(result.replaceAll("\r\n", "")).not.toContain("\n");
  });
});
