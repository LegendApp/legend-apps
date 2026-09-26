let request = 0;
let guard: (() => boolean) | undefined;

/** The app owns Finder events; the mounted presenter supplies its editing guard. */
export function registerDocumentOpenGuard(next: () => boolean) {
  guard = next;
  return () => { if (guard === next) guard = undefined; };
}

export async function openRequestedDocument(path: string, openPresenter: () => Promise<unknown>, load: (path: string) => Promise<unknown>, blocked: () => void) {
  const current = ++request;
  const allowed = () => { if (guard && !guard()) { blocked(); return false; } return true; };
  if (!allowed()) return;
  await openPresenter();
  if (current === request && allowed()) await load(path);
}
