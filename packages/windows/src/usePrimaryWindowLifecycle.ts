import {
  addApplicationReopenRequestedListener,
  addWindowClosedListener,
} from "@legend-apps/window-manager";
import { useEffect, useRef } from "react";

export type UsePrimaryWindowLifecycleOptions = {
  onInitialOpen: () => Promise<void> | void;
  onReopenRequested?: () => Promise<void> | void;
  onWindowClosed?: () => void;
  reportError: (error: unknown) => void;
  windowIdentifier?: string;
};

function runLifecycleAction(action: () => Promise<void> | void, reportError: (error: unknown) => void) {
  Promise.resolve().then(action).catch(reportError);
}

export function usePrimaryWindowLifecycle({
  onInitialOpen,
  onReopenRequested,
  onWindowClosed,
  reportError,
  windowIdentifier,
}: UsePrimaryWindowLifecycleOptions) {
  const didOpenRef = useRef(false);

  useEffect(() => {
    if (!didOpenRef.current) {
      didOpenRef.current = true;
      runLifecycleAction(onInitialOpen, reportError);
    }
  }, [onInitialOpen, reportError]);

  useEffect(() => {
    const subscription = onReopenRequested
      ? addApplicationReopenRequestedListener(({ hasVisibleWindows }) => {
          if (!hasVisibleWindows) {
            runLifecycleAction(onReopenRequested, reportError);
          }
        })
      : undefined;
    return () => subscription?.remove();
  }, [onReopenRequested, reportError]);

  useEffect(() => {
    const subscription = onWindowClosed && windowIdentifier
      ? addWindowClosedListener(({ identifier }) => {
          if (identifier === windowIdentifier) {
            onWindowClosed();
          }
        })
      : undefined;
    return () => subscription?.remove();
  }, [onWindowClosed, windowIdentifier]);
}
