export type NoteParagraph = { text: string; y: number; height: number };
export type NoteRegion = { step?: number; y: number; height: number };

/** Only real step labels carry the invisible marker; fenced examples never do. */
export function notesLayout(paragraphs: NoteParagraph[]): NoteRegion[] {
  const regions: NoteRegion[] = [];
  for (const paragraph of paragraphs) {
    const marker = /^(\d+)[.:)]\u2060\s/.exec(paragraph.text);
    const step = marker && Number(marker[1]) >= 1 ? Number(marker[1]) - 1 : undefined;
    if (!regions.length || step !== undefined) {
      const previous = regions.at(-1);
      if (previous) previous.height = Math.max(0, paragraph.y - previous.y);
      regions.push({ step, y: paragraph.y, height: paragraph.height });
    } else {
      const region = regions.at(-1)!;
      region.height = Math.max(region.height, paragraph.y + paragraph.height - region.y);
    }
  }
  return regions;
}
