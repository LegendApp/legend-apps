import { observable } from "@legendapp/state";
import { useEffect } from "react";
import { addWindowListener, getWindow } from "@legendapp/spark/windows";
import { ownRegistration } from "@legend-apps/runtime-utils";
export const isWindowFullScreen$ = observable(false);
export function HookWindowFullscreen() {
  useEffect(() => {
    let active = true, changed = false;
    const subscription = ownRegistration(addWindowListener("main", "fullscreenChanged", event => { changed = true; if (active) isWindowFullScreen$.set(event.fullscreen); }));
    void subscription.ready.then(() => getWindow("main")).then(info => { if (active && !changed && info) isWindowFullScreen$.set(info.fullscreen); }).catch(console.error);
    return () => { active = false; void subscription.remove().catch(console.error); };
  }, []);
  return null;
}
