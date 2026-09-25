// @ts-nocheck This suite uses Bun's test globals.
import { describe, expect, it } from "bun:test";
import { persistSlideSpeakerNotesWithFileAccess } from "../../../../packages/presentation/src/speakerNotesSource";

describe("persistSlideSpeakerNotes", () => {
  it("writes an updated source only when notes change", async () => {
    let source = "# Slide\n\n<!-- old -->\n";
    const writes: string[] = [];
    const fileAccess = {
      read: async () => source,
      writeIfUnchanged: async (_path: string, expected: string, next: string) => {
        expect(expected).toBe(source);
        writes.push(next);
        source = next;
        return true;
      },
    };

    expect(await persistSlideSpeakerNotesWithFileAccess("/deck.mdx", 0, "new", fileAccess)).toBe(true);
    expect(source).toBe("# Slide\n\n<!-- new -->\n");
    expect(await persistSlideSpeakerNotesWithFileAccess("/deck.mdx", 0, "new", fileAccess)).toBe(false);
    expect(writes).toHaveLength(1);
  });

  it("retries against fresh contents instead of overwriting an external edit", async () => {
    let source = "# Slide\n\n<!-- old -->\n\n---\n\n# Other slide\n";
    let attempts = 0;
    const fileAccess = {
      read: async () => source,
      writeIfUnchanged: async (_path: string, expected: string, next: string) => {
        attempts += 1;
        if (attempts === 1) {
          expect(expected).toBe(source);
          source = `${source}\nExternal edit on the other slide.\n`;
          return false;
        }
        expect(expected).toBe(source);
        source = next;
        return true;
      },
    };

    expect(await persistSlideSpeakerNotesWithFileAccess("/deck.mdx", 0, "new", fileAccess)).toBe(true);
    expect(attempts).toBe(2);
    expect(source).toContain("<!-- new -->");
    expect(source).toContain("External edit on the other slide.");
  });

  it("aborts if an external edit shifts the target slide index", async () => {
    let source = "# One\n\n---\n\n# Two\n\n<!-- old -->\n";
    let writes = 0;
    const fileAccess = {
      read: async () => source,
      writeIfUnchanged: async () => {
        writes += 1;
        source = `# Inserted\n\n---\n\n${source}`;
        return false;
      },
    };

    await expect(persistSlideSpeakerNotesWithFileAccess("/deck.mdx", 1, "new", fileAccess)).rejects.toThrow(
      "target slide changed",
    );
    expect(writes).toBe(1);
    expect(source).toContain("<!-- old -->");
    expect(source).not.toContain("<!-- new -->");
  });

  it("never writes malformed comment content", async () => {
    const source = "# Slide\n\n<!-- safe -->\n";
    let writes = 0;
    const fileAccess = {
      read: async () => source,
      writeIfUnchanged: async () => {
        writes += 1;
        return true;
      },
    };

    await expect(persistSlideSpeakerNotesWithFileAccess("/deck.mdx", 0, "unsafe --> text", fileAccess)).rejects.toThrow(
      "comment terminator",
    );
    expect(writes).toBe(0);
  });

  it("fails without writing over a file that keeps changing", async () => {
    let source = "# Slide\n\n---\n\n# Other slide\n";
    let writes = 0;
    const fileAccess = {
      read: async () => source,
      writeIfUnchanged: async () => {
        writes += 1;
        source += `\nexternal ${writes}`;
        return false;
      },
    };

    await expect(persistSlideSpeakerNotesWithFileAccess("/deck.mdx", 0, "notes", fileAccess)).rejects.toThrow(
      "changed while speaker notes were being saved",
    );
    expect(writes).toBe(3);
    expect(source).not.toContain("<!-- notes -->");
  });
});

it("rejects a reordered target before the first write, not only on retries", async () => {
  const { getSpeakerNotesTargets } = await import("../../../../packages/presentation/src/speakerNotesSource");
  const original = "# A\n\n<!-- old -->\n\n---\n\n# B";
  const target = getSpeakerNotesTargets(original)[0];
  let writes = 0;
  const io = { read: async () => "# B\n\n---\n\n# A", writeIfUnchanged: async () => { writes++; return true; } };
  await expect(persistSlideSpeakerNotesWithFileAccess("deck", 0, "for A", io, target)).rejects.toThrow("target slide changed");
  expect(writes).toBe(0);
});

it("keeps a stable target across successive note saves", async () => {
  const { getSpeakerNotesTargets } = await import("../../../../packages/presentation/src/speakerNotesSource");
  let source = "# A\n\n---\n\n# B";
  const target = getSpeakerNotesTargets(source)[0];
  const io = { read: async () => source, writeIfUnchanged: async (_path, expected, next) => {
    expect(expected).toBe(source); source = next; return true;
  } };
  await persistSlideSpeakerNotesWithFileAccess("deck", 0, "first", io, target);
  await persistSlideSpeakerNotesWithFileAccess("deck", 0, "second", io, target);
  expect(source).toContain("<!-- second -->");
});


it("protects external notes changed before autosave starts", async () => {
  const { getSpeakerNotesTargets } = await import("../../../../packages/presentation/src/speakerNotesSource");
  const original = "# Slide\n\n<!-- original -->\n";
  let disk = "# Slide\n\n<!-- external -->\n";
  let writes = 0;
  const access = { read: async () => disk, writeIfUnchanged: async (_path, _expected, next) => {
    writes++; disk = next; return true;
  } };
  await expect(persistSlideSpeakerNotesWithFileAccess("deck", 0, "local", access,
    getSpeakerNotesTargets(original)[0], "original")).rejects.toThrow("changed on disk");
  expect(writes).toBe(0);
  expect(disk).toContain("external");
  // A previously completed write is safe to acknowledge after recovery.
  expect(await persistSlideSpeakerNotesWithFileAccess("deck", 0, "external", access,
    getSpeakerNotesTargets(original)[0], "original")).toBe(false);
});
