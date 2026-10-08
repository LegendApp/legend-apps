import { readText, writeTextIfUnchanged } from "@legendapp/spark/files";
import { persistSlideSpeakerNotesWithFileAccess } from "@legend-apps/presentation";

const nativeFileAccess = {
  read: readText,
  writeIfUnchanged: async (path: string, expected: string, contents: string) => (await writeTextIfUnchanged(path, expected, contents)).written,
};

export async function persistSlideSpeakerNotes(
  path: string,
  slideIndex: number,
  notes: string,
  expectedTarget: string,
  expectedNotes: string | undefined,
) {
  return persistSlideSpeakerNotesWithFileAccess(path, slideIndex, notes, nativeFileAccess, expectedTarget, expectedNotes ?? null);
}
