import { observable } from "@legendapp/state";
import { useEffect } from "react";
import { addFullscreenChangeListener, isWindowFullScreen } from "@legendapp/spark/windows/controls";
export const isWindowFullScreen$ = observable(false);
export function HookWindowFullscreen() {
  useEffect(() => {
    void isWindowFullScreen().then(value => isWindowFullScreen$.set(value));
    const subscription = addFullscreenChangeListener(event => isWindowFullScreen$.set(event.isFullscreen));
    return () => subscription.remove();
  }, []);
  return null;
}
