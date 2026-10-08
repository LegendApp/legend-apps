import { startTransition, useEffect, useState, type ReactNode } from "react";
import { usePresentationValue } from "./runtime";
import { usePreparationTask } from "./PreparationBoundary";

/** Spread hidden native tree construction across idle commits; live content is complete immediately. */
export function ProgressivePreparation({ children }: { children: readonly ReactNode[] }) {
  const preparing = usePresentationValue("isPreparing");
  const count = children.length;
  const [preparedCount, setPreparedCount] = useState(() => preparing ? 0 : count);
  if (preparedCount > count || !preparing && preparedCount < count) {
    setPreparedCount(count);
  }

  usePreparationTask(!!preparing && preparedCount < count);

  useEffect(() => {
    if (!preparing || preparedCount >= count) return;
    let cancelled = false;
    const idle = requestIdleCallback(() => {
      if (cancelled) return;
      startTransition(() => setPreparedCount(current => cancelled ? current : Math.min(current + 1, count)));
    });
    return () => {
      cancelled = true;
      cancelIdleCallback(idle);
    };
  }, [preparing, preparedCount, count]);

  return <>{preparing ? children.slice(0, preparedCount) : children}</>;
}
