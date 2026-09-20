import { useLayoutEffect, useState } from "react";
import { useSharedElementTransition } from "./focus";
import { usePresentationValue } from "./runtime";

/** A matched entrance must not replay when the host releases its transition. */
export function useSharedElementEntrance(id: string) {
  const preparing = usePresentationValue("isPreparing");
  const matched = useSharedElementTransition(id);
  const [enteredThroughMatch, setEnteredThroughMatch] = useState(false);
  useLayoutEffect(() => {
    if (preparing) setEnteredThroughMatch(false);
    else if (matched) setEnteredThroughMatch(true);
  }, [matched, preparing]);
  return !matched && !enteredThroughMatch;
}
