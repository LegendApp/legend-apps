import { batch } from "@legendapp/state";
import { settings$ } from "@/systems/Settings";
import { stateSaved$ } from "@/systems/State";
import { themeState$ } from "@/theme/ThemeProvider";

export function preloadPersistence() {
    batch(() => {
        settings$.get();
        stateSaved$.get();
        themeState$.get();
    });
}
