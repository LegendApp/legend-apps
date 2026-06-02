import { useMount } from "@legendapp/state/react";
import { useRef } from "react";
import { useWindowManager } from "@legend-desktop/window-manager";
import { useWindowId } from "./WindowProvider";

export function useWindowFocusEffect(callback: () => void) {
    const windowId = useWindowId();
    const windowManagerRef = useRef(useWindowManager());

    useMount(() => {
        if (!windowId) {
            return;
        }

        const subscription = windowManagerRef.current.onWindowFocused(({ identifier }) => {
            if (identifier === windowId) {
                callback();
            }
        });

        return () => {
            subscription.remove();
        };
    });
}
