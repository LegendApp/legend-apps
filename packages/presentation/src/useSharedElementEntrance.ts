import { useLayoutEffect, useState } from "react";
import { useSharedElementTransition } from "./focus";
import { usePresentationValue } from "./runtime";

/** A matched entrance must not replay when the host releases its transition. */
export function useSharedElementEntrance(id: string) {
  const preparing = usePresentationValue("isPreparing");
  const phase = usePresentationValue("playbackPhase");
  const startedAt = usePresentationValue("startedAt");
  const matched = useSharedElementTransition(id);
  const [entrance, setEntrance] = useState(() => ({ startedAt, matched: false }));
  if (phase === "playing" && entrance.startedAt !== startedAt) {
    setEntrance({ startedAt, matched });
  }
  useLayoutEffect(() => {
    if (preparing) setEntrance(current => current.matched ? { ...current, matched: false } : current);
    else if (matched) setEntrance(current => current.matched ? current : { ...current, matched: true });
  }, [matched, preparing]);
  return !matched && !entrance.matched;
}
