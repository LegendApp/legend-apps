import { useLayoutEffect, useRef, type ReactNode } from "react";
import { snapshotCaptureQueue } from "./snapshotCaptureQueue";

/** Multiple windows can block the shared capture queue independently. */
export function SnapshotCaptureBoundary({ suspended, children }: { suspended: boolean; children: ReactNode }) {
  const owner = useRef({});
  useLayoutEffect(() => {
    const token = owner.current;
    snapshotCaptureQueue.block(token, suspended);
    return () => snapshotCaptureQueue.block(token, false);
  }, [suspended]);
  return children;
}
