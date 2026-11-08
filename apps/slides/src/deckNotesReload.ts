import { getDeckSourceStructure, getSpeakerNotesTargets } from "../../../packages/presentation/src/speakerNotesSource";

type InputAccess = {
  stat(path: string): Promise<{ type: string; size: number; modifiedAt: number }>;
  list(path: string): Promise<{ name: string }[]>;
};

export function deckNotesSource(source: string) {
  const { slides, comments, frontmatter } = getDeckSourceStructure(source);
  return {
    key: JSON.stringify([
      source.slice(0, slides[0]?.contentStart ?? 0),
      frontmatter.map(range => source.slice(range.fullStart, range.fullEnd)),
      getSpeakerNotesTargets(source),
    ]),
    notes: slides.map(slide => comments.filter(comment => comment.start >= slide.contentStart && comment.end <= slide.end)
      .map(comment => source.slice(comment.contentStart, comment.contentEnd).trim()).join("\n\n")),
  };
}

/** A directory notification can coalesce a note save and an imported helper edit. */
export async function deckNotesInputs(path: string, dependencies: readonly string[], directories: readonly string[], io: InputAccess, builtAt = Infinity) {
  const files = [...new Set(dependencies.filter(file => file !== path))].sort();
  const folders = [...new Set([...directories, ...dependencies.map(file => file.slice(0, file.lastIndexOf("/")))])].sort();
  const [stats, entries] = await Promise.all([
    Promise.all(files.map(async file => {
      const info = await io.stat(file);
      if (info.type !== "file" || info.modifiedAt > builtAt) throw new Error("Deck input changed during compilation.");
      return [file, info.size, info.modifiedAt];
    })),
    Promise.all(folders.map(async folder => {
      const info = await io.stat(folder);
      if (info.type !== "directory" || info.modifiedAt > builtAt) throw new Error("Deck directory changed during compilation.");
      return [folder, (await io.list(folder)).map(entry => entry.name).sort()];
    })),
  ]);
  return JSON.stringify([stats, entries]);
}
