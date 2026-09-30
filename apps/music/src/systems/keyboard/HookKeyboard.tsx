import { ownRegistration } from "@legend-apps/runtime-utils";
import { useHotkeySuspension, type HotkeyScope } from "@legendapp/spark/shortcuts/commands";
import { useMount, useValue } from "@legendapp/state/react";
import { useRef } from "react";
import { AppState, type AppStateStatus, TextInput } from "react-native";
import { addWindowListener } from "@legendapp/spark/windows";
import { musicHotkeyRouter } from "./Keyboard";
import { perfCount, perfLog } from "@legend-apps/runtime-utils";
import { state$ } from "../State";

const applicationHotkeyScope: HotkeyScope = { kind: "application" };

export function HookKeyboard() {
    perfCount("HookKeyboard.render");
    const isDropdownOpen = useValue(state$.isDropdownOpen);

    useHotkeySuspension({
        active: isDropdownOpen,
        router: musicHotkeyRouter,
        scope: applicationHotkeyScope,
    });

    useMount(() => {
        musicHotkeyRouter.setActiveWindowId("main");

        const subscription = ownRegistration(addWindowListener("main", "focusChanged", ({ focused }) => { if (focused) musicHotkeyRouter.setActiveWindowId("main"); }));

        return () => {
            void subscription.remove().catch(console.error);
        };
    });

    return <HiddenTextInput />;
}

export function HiddenTextInput() {
    perfCount("HookKeyboard.HiddenTextInput.render");
    const inputRef = useRef<TextInput>(null);
    const appStateRef = useRef<AppStateStatus>(AppState.currentState);

    useMount(() => {
        const tryFocus = () => {
            if (appStateRef.current === "active") {
                inputRef.current?.focus();
            }
        };

        // Focus shortly after mount so the keyboard hook starts immediately.
        const focusTimeout = setTimeout(tryFocus, 10);

        const subscription = AppState.addEventListener("change", (state) => {
            appStateRef.current = state;
            perfLog("HookKeyboard.AppStateChange", { state });

            if (state === "active") {
                // Delay a little so the window becomes active before refocusing.
                setTimeout(tryFocus, 50);
            }
        });

        return () => {
            clearTimeout(focusTimeout);
            subscription.remove();
        };
    });

    return (
        <TextInput
            ref={inputRef}
            className="absolute left-[-1000px] h-0 w-0 opacity-0"
            onFocus={() => perfLog("HookKeyboard.HiddenTextInput.onFocus")}
            autoFocus
        />
    );
}
