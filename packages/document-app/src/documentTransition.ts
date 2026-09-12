/** Serialize destructive document transitions without queuing stale user intent. */
export function createDocumentTransitionGuard() {
  let pending = false;
  return async (prepare: () => Promise<boolean>, transition: () => void | Promise<void>) => {
    if (pending) return false;
    pending = true;
    try {
      if (!await prepare()) return false;
      await transition();
      return true;
    } finally { pending = false; }
  };
}
