import { ownRegistration } from "@legend-apps/runtime-utils";
import { addWindowListener, beforeWindowClose, useWindowId } from "@legendapp/spark/windows";
import { useEffect, useRef } from "react";
import { prepareDiffWindowForTransition } from "./diffAppExit";

export function DiffWindowLifecycle({ onClose }: { onClose?: () => void }) {
  const windowId = useWindowId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    let active = true;
    const guard = ownRegistration(beforeWindowClose(windowId, async () => {
      if (!active) return false;
      try { return await prepareDiffWindowForTransition(windowId, "close"); }
      catch (error) { console.error(error); return false; }
    }));
    const closed = ownRegistration(addWindowListener(windowId, "closed", () => {
      if (active) onCloseRef.current?.();
    }));
    return () => { active = false; void guard.remove().catch(console.error); void closed.remove().catch(console.error); };
  }, [windowId]);
  return null;
}
