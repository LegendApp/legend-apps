import { useMount } from "@legendapp/state/react";
import { useRef } from "react";
import { AppState, type AppStateStatus, TextInput } from "react-native";
import { useWindowManager } from "@legend-desktop/window-manager";
import { activeWindowId$, useHookKeyboard } from "@/systems/keyboard/Keyboard";
import { perfCount, perfLog } from "@legend-desktop/runtime-utils";

export function HookKeyboard() {
    perfCount("HookKeyboard.render");
    useHookKeyboard();
    const windowManagerRef = useRef(useWindowManager());

    useMount(() => {
        activeWindowId$.set("main");

        const subscription = windowManagerRef.current.onWindowFocused(({ identifier }) => {
            const nextIdentifier = identifier && identifier.length > 0 ? identifier : "main";
            activeWindowId$.set(nextIdentifier);
        });

        return () => {
            subscription.remove();
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
