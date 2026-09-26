import { readTextFile, writeTextFileIfUnchanged } from "@legendapp/spark/dialogs";
import { persistSlideSpeakerNotesWithFileAccess } from "@legend-apps/presentation";

const nativeFileAccess = {
  read: readTextFile,
  writeIfUnchanged: writeTextFileIfUnchanged,
};

export async function persistSlideSpeakerNotes(
  path: string,
  slideIndex: number,
  notes: string,
  expectedTarget: string,
  expectedNotes: string,
) {
  return persistSlideSpeakerNotesWithFileAccess(path, slideIndex, notes, nativeFileAccess, expectedTarget, expectedNotes);
}
