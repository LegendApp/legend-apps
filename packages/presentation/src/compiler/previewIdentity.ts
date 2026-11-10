import { createHash } from "node:crypto";
import fs from "node:fs";
import { getDeckSourceStructure, getSpeakerNotesTargets } from "../speakerNotesSource";

function visualSource(source: string) {
  const { slides, frontmatter } = getDeckSourceStructure(source);
  return JSON.stringify([source.slice(0, slides[0]?.contentStart ?? 0),
    frontmatter.map(range => source.slice(range.fullStart, range.fullEnd)), getSpeakerNotesTargets(source)]);
}

export async function createPreviewIdentity(deck: string, source: string, dependencies: string[], toolchain: string, builtAt: number) {
  try {
    const content = createHash("sha256").update(JSON.stringify([1, toolchain]));
    for (const file of [...new Set([deck, ...dependencies])].sort()) {
      const input = createHash("sha256");
      if (file === deck) input.update(visualSource(source));
      else {
        const before = fs.statSync(file);
        if (!before.isFile() || before.mtimeMs > builtAt) return undefined;
        if (file.toLowerCase().endsWith(".mdx")) input.update(visualSource(fs.readFileSync(file, "utf8")));
        else for await (const chunk of fs.createReadStream(file)) input.update(chunk);
        const after = fs.statSync(file);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) return undefined;
      }
      content.update(JSON.stringify([file, input.digest("hex")]));
    }
    return { deck: createHash("sha256").update(deck).digest("hex"), content: content.digest("hex") };
  } catch {
    // An uncertain input snapshot must never publish a reusable preview identity.
    return undefined;
  }
}
