/** Coalesce file events without interrupting a running rebuild or losing its follow-up. */
export function createDeckReloadQueue(reload: () => Promise<unknown>, delay = 120, onError: (error: unknown) => void = console.error) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let pending = false;
  let disposed = false;

  const flush = async () => {
    timer = undefined;
    if (!disposed && !running && pending) {
      pending = false;
      running = true;
      try {
        await reload();
      } catch (error) {
        onError(error);
      } finally {
        running = false;
        if (!disposed && pending && !timer) timer = setTimeout(() => { void flush(); }, delay);
      }
    }
  };

  return {
    changed(event: { contentChanged?: boolean }) {
      if (!disposed && event.contentChanged !== false) {
        pending = true;
        clearTimeout(timer);
        timer = setTimeout(() => { void flush(); }, delay);
      }
    },
    dispose() {
      disposed = true;
      pending = false;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
