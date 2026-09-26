import type { DeckEditorSession } from "./deckEditorSession";

/** Export the latest edit snapshot without treating the original deck as saved. */
export async function saveDeckDraftCopy(session: DeckEditorSession, choosePath: () => Promise<string | null>,
  write: (path: string, source: string) => Promise<unknown>) {
  const path = await choosePath();
  if (!path) return false;
  if (path === session.getSnapshot().path) throw new Error("Choose a different file to preserve the deck on disk.");
  await write(path, session.getSource());
  return true;
}
