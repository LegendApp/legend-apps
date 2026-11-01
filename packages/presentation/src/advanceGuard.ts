const guards = new Set<() => Promise<void>>();
let pending = false;

/** Active audience builds may finish before the host replaces their surface. */
export function registerAdvanceGuard(guard: () => Promise<void>) {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

export function deferPresentationAdvance(advance: () => void, isCurrent: () => boolean) {
  if (pending) return true;
  if (!guards.size) return false;
  pending = true;
  Promise.all(Array.from(guards, guard => guard())).then(() => {
    pending = false;
    if (isCurrent()) advance();
  });
  return true;
}
