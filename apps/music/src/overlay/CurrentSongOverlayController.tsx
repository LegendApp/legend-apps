import { useObserveEffect } from "@legendapp/state/react";
import { useRef } from "react";
import { localPlayerState$ } from "@/components/LocalAudioPlayer";
import { settings$ } from "@/systems/Settings";

import {
    currentSongOverlay$,
    presentCurrentSongOverlay,
    requestCurrentSongOverlayDismissal,
    resetCurrentSongOverlayTimer,
} from "./CurrentSongOverlayState";

export function CurrentSongOverlayController() {
    const lastTrackIdRef = useRef<string | null>(null);

    useObserveEffect(() => {
        const currentTrack = localPlayerState$.currentTrack.get();
        const isPlaying = localPlayerState$.isPlaying.get();
        const trackId = currentTrack?.id ?? null;
        const overlayEnabled = settings$.overlay.enabled.get();
        const shouldShow = Boolean(trackId && overlayEnabled && isPlaying);

        if (shouldShow && trackId) {
            if (trackId !== lastTrackIdRef.current) {
                presentCurrentSongOverlay();
            }
            lastTrackIdRef.current = trackId;
            return;
        }

        if (currentSongOverlay$.isWindowOpen.get()) {
            requestCurrentSongOverlayDismissal();
        }

        if (!trackId) {
            lastTrackIdRef.current = null;
        }
    });

    useObserveEffect(() => {
        settings$.overlay.displayDurationSeconds.get();
        if (currentSongOverlay$.isWindowOpen.get()) {
            resetCurrentSongOverlayTimer();
        }
    });

    return null;
}
