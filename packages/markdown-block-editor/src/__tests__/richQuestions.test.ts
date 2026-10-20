import { describe, expect, test } from "bun:test";
import { parseQuestion, questionFences } from "../richQuestions";

const body = "id: release\nprompt: Pick a date\noptions: [Nov 3, Nov 10]\nanswer: # waiting\n";
const wrap = (value: string) => `Before\n\n\`\`\`question\n${value}\`\`\`\n\nAfter\n`;

describe("question parsing", () => {
  test("accepts YAML and JSON with the default single type", () => {
    expect(parseQuestion(body)).toMatchObject({ id: "release", type: "single" });
    expect(parseQuestion(body).answer).toBeUndefined();
    expect(parseQuestion('{"id":"text","prompt":"Why?","type":"text","answer":"Because"}').answer).toBe("Because");
  });
  test("validates options, answer types, and required fields", () => {
    for (const value of ["id: test", body.replace("options: [Nov 3, Nov 10]", "options: []"), body.replace("answer: # waiting", "answer: Tomorrow"), body + "type: other\n", body + "id: duplicate\n"]) {
      expect(() => parseQuestion(value)).toThrow();
    }
    expect(() => parseQuestion(body + "type: multi\nanswer: Nov 3\n")).toThrow();
    expect(parseQuestion(body.replace("answer: # waiting", "answer: Tomorrow") + "allowOther: true\n").answer).toBe("Tomorrow");
  });
  test("ignores question examples inside another fence and accepts tilde fences", () => {
    expect(questionFences("````md\n```question\nid: example\n```\n````\n")).toEqual([]);
    expect(questionFences(`~~~question\n${body}~~~\n`)).toHaveLength(1);
  });
});

