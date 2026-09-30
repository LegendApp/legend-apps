import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useEffect } from "react";
import { registerGlobalShortcut } from "@legendapp/spark/global-shortcuts";
import { showWindow } from "@legendapp/spark/windows";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { settings$ } from "./Settings";
export const globalHotkeyStatus$ = observable({ error: null as string | null });
export function GlobalHotkeyManager() {
    const enabled = useValue(settings$.general.globalHotkeyEnabled);
    const hotkey = useValue(settings$.general.globalHotkey);
    useEffect(() => {
        if (!enabled || !hotkey) return;
        let active = true;
        const report = (error: unknown) => { if (active) globalHotkeyStatus$.error.set(String(error)); else console.error(error); };
        const registration = ownRegistration(registerGlobalShortcut(hotkey, () => { if (active) void showWindow("main").catch(report); }), report);
        void registration.ready.then(() => { if (active) globalHotkeyStatus$.error.set(null); }, () => {});
        return () => { active = false; void registration.remove().catch(report); };
    }, [enabled, hotkey]);
    return null;
}
