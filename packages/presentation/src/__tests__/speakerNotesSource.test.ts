// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileDeck } from "../compiler";
import { updateSlideSpeakerNotes } from "../speakerNotesSource";

describe("updateSlideSpeakerNotes", () => {
  test("updates only the target slide comment", () => {
    const source = "# One\n\n<!-- first -->\n\n---\n\n# Two\n\n<!-- second -->\n";

    expect(updateSlideSpeakerNotes(source, 1, "updated **notes**")).toBe(
      "# One\n\n<!-- first -->\n\n---\n\n# Two\n\n<!-- updated **notes** -->\n",
    );
  });

  test("creates a comment before the next slide separator", () => {
    const source = "# One\n\n---\n\n# Two\n";

    expect(updateSlideSpeakerNotes(source, 0, "new note")).toBe(
      "# One\n\n<!-- new note -->\n\n---\n\n# Two\n",
    );
  });

  test("creates notes on the last slide without changing final-newline style", () => {
    expect(updateSlideSpeakerNotes("# One", 0, "note")).toBe("# One\n\n<!-- note -->");
    expect(updateSlideSpeakerNotes("# One\n", 0, "note")).toBe("# One\n\n<!-- note -->\n");
  });

  test("preserves CRLF line endings when inserting", () => {
    const source = "# One\r\n\r\n---\r\n\r\n# Two\r\n";

    expect(updateSlideSpeakerNotes(source, 0, "note")).toBe(
      "# One\r\n\r\n<!-- note -->\r\n\r\n---\r\n\r\n# Two\r\n",
    );
  });

  test("removes comments when notes are cleared", () => {
    const source = "# One\n\n<!-- remove me -->\n\n---\n\n# Two\n";

    expect(updateSlideSpeakerNotes(source, 0, "  ")).toBe("# One\n\n\n\n---\n\n# Two\n");
  });

  test("does not rewrite an unchanged comment", () => {
    const source = "# One\n\n<!--\nline one\n\nline two\n-->\n";

    expect(updateSlideSpeakerNotes(source, 0, "line one\n\nline two")).toBe(source);
  });

  test("coalesces multiple presenter comments without touching content between them", () => {
    const source = "# One\n\n<!-- first -->\n\nVisible content.\n\n<!-- second -->\n";

    expect(updateSlideSpeakerNotes(source, 0, "combined")).toBe(
      "# One\n\n<!-- combined -->\n\nVisible content.\n\n\n",
    );
  });

  test("ignores comment and separator syntax inside fenced code", () => {
    const source = [
      "# One",
      "",
      "```mdx",
      "<!-- sample, not notes -->",
      "---",
      "```",
      "",
      "<!-- actual note -->",
      "",
      "---",
      "",
      "# Two",
      "",
    ].join("\n");

    const updated = updateSlideSpeakerNotes(source, 0, "changed");
    expect(updated).toContain("<!-- sample, not notes -->\n---\n```");
    expect(updated).toContain("<!-- changed -->");
    expect(updated).not.toContain("<!-- actual note -->");
    expect(updateSlideSpeakerNotes(updated, 1, "second")).toEndWith("# Two\n\n<!-- second -->\n");
  });

  test("does not treat a thematic break nested in JSX as a slide boundary", () => {
    const source = "<View>\n\n---\n\nInside the first slide.\n\n</View>\n\n---\n\n# Two\n";

    const updated = updateSlideSpeakerNotes(source, 1, "second note");
    expect(updated).toBe(`${source}\n<!-- second note -->\n`);
  });

  test("does not treat separator text inside a multiline JSX tag as a slide boundary", () => {
    const source = [
      "<Card",
      "  label={`",
      "---",
      "  `}",
      ">",
      "Content",
      "</Card>",
      "",
      "---",
      "",
      "# Two",
      "",
    ].join("\n");

    expect(updateSlideSpeakerNotes(source, 1, "second note")).toBe(`${source}\n<!-- second note -->\n`);
  });

  test("does not treat separator text inside an MDX expression as a slide boundary", () => {
    const source = [
      "# One",
      "",
      "{`",
      "---",
      "`}",
      "",
      "---",
      "",
      "# Two",
      "",
    ].join("\n");

    expect(updateSlideSpeakerNotes(source, 1, "second note")).toBe(`${source}\n<!-- second note -->\n`);
  });

  test("keeps deck and per-slide frontmatter intact", () => {
    const source = [
      "---",
      "title: Deck",
      "---",
      "# First",
      "<!-- first -->",
      "---",
      "transition: slide",
      "speaker: Jay",
      "---",
      "# Second",
      "<!-- second -->",
      "",
    ].join("\n");

    expect(updateSlideSpeakerNotes(source, 1, "updated")).toBe([
      "---",
      "title: Deck",
      "---",
      "# First",
      "<!-- first -->",
      "---",
      "transition: slide",
      "speaker: Jay",
      "---",
      "# Second",
      "<!-- updated -->",
      "",
    ].join("\n"));
  });

  test("supports multiline Markdown containing JSX-like text", () => {
    const notes = "Use `const value = <Thing />`.\n\n- First\n- Second\n\n**Finish.**";
    const updated = updateSlideSpeakerNotes("# Slide\n", 0, notes);

    expect(updated).toBe(`# Slide\n\n<!--\n${notes}\n-->\n`);
  });

  test("rejects content that could terminate the generated comment", () => {
    const source = "# One\n\n<!-- safe -->\n";

    expect(() => updateSlideSpeakerNotes(source, 0, "unsafe --> content")).toThrow("comment terminator");
    expect(source).toBe("# One\n\n<!-- safe -->\n");
  });

  test("rejects invalid slide indexes", () => {
    expect(() => updateSlideSpeakerNotes("# One\n", -1, "note")).toThrow("non-negative integer");
    expect(() => updateSlideSpeakerNotes("# One\n", 1, "note")).toThrow("does not exist");
  });

  test("produces MDX that still compiles with updated and inserted notes", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "legend-slide-notes-"));
    const deckPath = path.join(directory, "deck.mdx");
    try {
      let source = "# One\n\n<!-- old -->\n\n---\n\n# Two\n";
      source = updateSlideSpeakerNotes(source, 0, "updated **first**");
      source = updateSlideSpeakerNotes(source, 1, "inserted _second_");
      fs.writeFileSync(deckPath, source);

      const result = await compileDeck(deckPath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.code).toContain("updated **first**");
        expect(result.code).toContain("inserted _second_");
      }
    } finally {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  });
});
