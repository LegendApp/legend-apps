import { createStorage } from "@legendapp/spark/settings/observable";
import { createNotesDrafts, type NotesDraft } from "./notesDrafts";
const storage = createStorage({ subfolder: "slides" });
export const speakerNotesDrafts = createNotesDrafts({
  read: () => storage.read<Record<string, NotesDraft | string>>("notes-drafts.json", { format: "json" }) ?? {},
  write: drafts => storage.write("notes-drafts.json", drafts, { format: "json" }),
});
