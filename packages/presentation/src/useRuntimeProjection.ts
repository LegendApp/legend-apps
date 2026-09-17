import { internal, observable } from "@legendapp/state";
import type { PresentationRuntime } from "./types";
import { useEffect, useMemo, type DependencyList } from "react";

/** A read-only projection with React-owned lifetime, including StrictMode replay.
 * Dependencies describe an external view target; live state belongs in tracked reads.
 * beta.47's useObservable dependency updates notify during render and its cleanup
 * does not reactivate on effect replay. Keep this version-specific adapter local.
 */
export function useRuntimeProjection(compute: () => PresentationRuntime, dependencies: DependencyList) {
  const owned = useMemo(() => ({ value$: observable<PresentationRuntime>(compute), compute, disposed: false }), dependencies);
  useEffect(() => {
    const node = internal.getNode(owned.value$);
    if (owned.disposed) {
      internal.reactivateNode(node, owned.compute);
      owned.value$.peek();
      owned.disposed = false;
    }
    return () => {
      internal.deactivateNode(node);
      owned.disposed = true;
    };
  }, [owned]);
  return owned.value$;
}
