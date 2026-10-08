import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

function createPreparation() {
  const pending = new Set<object>();
  const listeners = new Set<() => void>();
  let scheduled = false;
  const notify = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!pending.size) for (const listener of [...listeners]) listener();
    });
  };
  return {
    set(owner: object, waiting: boolean) {
      if (waiting) pending.add(owner); else pending.delete(owner);
      notify();
    },
    whenReady(listener: () => void) {
      listeners.add(listener);
      notify();
      return () => { listeners.delete(listener); };
    },
  };
}
const PreparationContext = createContext<ReturnType<typeof createPreparation> | undefined>(undefined);

/** Children register unfinished mounts and GPU setup before the parent layout effect. */
export function PreparationBoundary({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [preparation] = useState(createPreparation);
  useLayoutEffect(() => {
    if (!onReady) return;
    let delivered = false;
    return preparation.whenReady(() => {
      if (!delivered) { delivered = true; onReady(); }
    });
  }, [preparation, onReady]);
  return <PreparationContext.Provider value={preparation}>{children}</PreparationContext.Provider>;
}

export function usePreparationTask(waiting: boolean) {
  const preparation = useContext(PreparationContext);
  const [owner] = useState(() => ({}));
  useLayoutEffect(() => {
    preparation?.set(owner, waiting);
  }, [preparation, owner, waiting]);
  useLayoutEffect(() => () => { preparation?.set(owner, false); }, [preparation, owner]);
}
