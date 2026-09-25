import { createStorage } from "@legend-apps/storage";
import { createNotesDrafts } from "./notesDrafts";
const storage = createStorage({ subfolder: "slides" });
export const speakerNotesDrafts = createNotesDrafts({
  read: () => storage.read<Record<string, string>>("notes-drafts.json", { format: "json" }) ?? {},
  write: drafts => storage.write("notes-drafts.json", drafts, { format: "json" }),
});
