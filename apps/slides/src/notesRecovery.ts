import type { NotesDrafts } from "./notesDrafts";

export function describeNoteDraft(key: string) {
  try {
    const [path, index] = JSON.parse(key.slice(0, key.indexOf("]:") + 1));
    if (typeof path === "string" && Number.isInteger(index)) return `${path} — Slide ${index + 1}`;
  } catch {}
  return "Recovered speaker notes";
}

/** Failed deck writes need not trap the user when a durable recovery copy exists. */
export async function prepareNotesExit(drafts: NotesDrafts, choose: (affected: string[]) => Promise<"cancel" | "keep" | "export">,
  exportDrafts: (contents: string) => Promise<boolean>) {
  if (await drafts.flushAll()) return true;
  const choice = await choose(drafts.entries().map(([key]) => describeNoteDraft(key)));
  if (choice === "cancel") return false;
  if (choice === "export") {
    const contents = drafts.entries().map(([key, draft]) => `# ${describeNoteDraft(key)}\n\n${draft.text}`).join("\n\n---\n\n");
    if (!await exportDrafts(contents)) return false;
  }
  // Include edits made while the choice or export dialog was open. If local
  // storage fails, refuse to quit even if an older export succeeded.
  drafts.persist();
  return true;
}
