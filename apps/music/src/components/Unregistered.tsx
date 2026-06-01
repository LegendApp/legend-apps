import { currentTime as currentTime$ } from "@legendapp/state/helpers/time";
import { useObservable, useValue } from "@legendapp/state/react";
import { Pressable, Text } from "react-native";
import { settings$ } from "@/systems/Settings";
import { state$ } from "@/systems/State";

export function Unregistered() {
    const isRegistered = useValue(settings$.registration.isRegistered);
    const startTime$ = useObservable(Date.now());

    const visibilityState = useValue(() => {
        const elapsed = +currentTime$.get() - startTime$.get();
        const sixtyMinutes = 60 * 60 * 1000;

        if (elapsed < sixtyMinutes) return false;
        return true;
    });

    // Don't show if registered or still in hidden period
    if (isRegistered || !visibilityState) {
        return null;
    }

    const handleRegister = () => {
        // TODO: Implement registration flow
        console.log("Register button clicked");
        state$.showSettingsPage.set("account");
        state$.showSettings.set(true);
    };

    return (
        <Pressable onPress={handleRegister} className="border-t border-white/10 opacity-70 px-4 py-2 cursor-pointer">
            <Text className="text-white/70 text-xs text-center">Support Legend Music development</Text>
        </Pressable>
    );
}
