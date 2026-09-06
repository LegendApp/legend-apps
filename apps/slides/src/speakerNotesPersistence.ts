import { readTextFile, writeTextFileIfUnchanged } from "@legend-apps/file-dialog";
import { persistSlideSpeakerNotesWithFileAccess } from "@legend-apps/presentation";

const nativeFileAccess = {
  read: readTextFile,
  writeIfUnchanged: writeTextFileIfUnchanged,
};

export async function persistSlideSpeakerNotes(
  path: string,
  slideIndex: number,
  notes: string,
) {
  return persistSlideSpeakerNotesWithFileAccess(path, slideIndex, notes, nativeFileAccess);
}
