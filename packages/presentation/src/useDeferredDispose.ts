import { useEffect, useRef } from "react";
import { afterTwoFrames } from "./snapshotCaptureQueue";

/** Dispose a resource a canvas may still draw only two frames after it is replaced or unmounted; reuse before then (StrictMode) cancels that. */
export function useDeferredDispose(resource: { dispose(): void } | null | undefined) {
  const pending = useRef<{ resource: object; cancel: () => void }>(undefined);
  useEffect(() => {
    if (!resource) return;
    if (pending.current?.resource === resource) {
      pending.current.cancel();
      pending.current = undefined;
    }
    return () => {
      pending.current = { resource, cancel: afterTwoFrames(() => resource.dispose()) };
    };
  }, [resource]);
}
