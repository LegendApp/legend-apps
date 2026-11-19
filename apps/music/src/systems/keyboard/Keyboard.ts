import {
    createHotkeyRouter,
    useRoutedHotkeys,
    type HotkeyHandlerContext,
    type HotkeyScope,
    type HotkeyValue,
} from "@legendapp/spark/shortcuts/commands";
import { useWindowFocusEffect, useWindowId } from "@legendapp/spark/windows";
import { useMemo } from "react";
import {
    allMusicHotkeyDefinitions,
    hotkeys$,
    type MusicHotkeyBindingName,
} from "../hotkeys";
import { useValue } from "@legendapp/state/react";

export type KeyboardEventCodeHotkey = HotkeyValue;
export type MusicHotkeyHandler = (context: HotkeyHandlerContext) => boolean | void;
type HotkeyCallbacks = Partial<Record<MusicHotkeyBindingName, MusicHotkeyHandler>>;

export type HotkeyScopeOptions = {
    global?: boolean;
    priority?: number;
    windowId?: string;
};

export const musicHotkeyRouter = createHotkeyRouter();
musicHotkeyRouter.setActiveWindowId("main");

function useCurrentWindowId(): string {
    try {
        return useWindowId();
    } catch {
        return "main";
    }
}

export function useActiveHotkeyWindow() {
    const windowId = useCurrentWindowId();
    useWindowFocusEffect(() => musicHotkeyRouter.setActiveWindowId(windowId));
}

export function useOnHotkeys(hotkeyCallbacks: HotkeyCallbacks, options: HotkeyScopeOptions = {}) {
    const bindings = useValue(hotkeys$);
    const contextWindowId = useCurrentWindowId();
    const windowId = options.windowId ?? contextWindowId;
    const scope = useMemo<HotkeyScope>(() => {
        return options.global ? { kind: "application" } : { kind: "window", windowId };
    }, [options.global, windowId]);

    useRoutedHotkeys({
        bindings,
        definitions: allMusicHotkeyDefinitions,
        handlers: hotkeyCallbacks,
        priority: options.priority,
        router: musicHotkeyRouter,
        scope,
    });
}
