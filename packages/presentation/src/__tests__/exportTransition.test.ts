// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyTransitionToDeck } from "../compiler/exportTransition";

test("transition export rewrites metadata and preserves fenced, note, and expression examples", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "transition-export-"));
  try {
    const deck = path.join(root, "deck.mdx");
    const examples = '# Examples\n\n````yaml\n```\n---\ntransition: fade\n---\n```\n````\n\n<!--\n---\ntransition: fade\n---\n-->\n\n{`\n---\ntransition: fade\n---\n`}';
    fs.writeFileSync(deck, examples);
    await expect(copyTransitionToDeck(deck, "fade", root)).rejects.toThrow("does not reference");
    expect(fs.readdirSync(root)).toEqual(["deck.mdx"]);
    const source = `---\ntransition: fade\n---\n${examples}\n\n---\ntransition: fade\n---\n# Next`;
    fs.writeFileSync(deck, source);
    const result = await copyTransitionToDeck(deck, "fade", root);
    expect(result.updated).toContain(examples);
    expect(result.updated.match(/source: .\/transition-fade.ts/g)).toHaveLength(2);
    expect(fs.readFileSync(deck, "utf8")).toBe(source);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
