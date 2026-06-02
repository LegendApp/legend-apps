import { batch, observable } from "@legendapp/state";

import {
    OVERLAY_MAX_DISPLAY_DURATION_SECONDS,
    OVERLAY_MIN_DISPLAY_DURATION_SECONDS,
    settings$,
} from "@/systems/Settings";

import { OVERLAY_WINDOW_HEIGHT_COMPACT, OVERLAY_WINDOW_WIDTH_COMPACT } from "./OverlayConstants";

export const currentSongOverlay$ = observable({
    isWindowOpen: false,
    presentationId: 0,
    isExiting: false,
    windowHeight: OVERLAY_WINDOW_HEIGHT_COMPACT,
    windowWidth: OVERLAY_WINDOW_WIDTH_COMPACT,
});

let hideTimer: ReturnType<typeof setTimeout> | null = null;

const clearHideTimer = () => {
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
};

const getDisplayDurationMs = () => {
    const configuredSeconds = settings$.overlay.displayDurationSeconds.get();
    const clampedSeconds = Math.min(
        Math.max(configuredSeconds, OVERLAY_MIN_DISPLAY_DURATION_SECONDS),
        OVERLAY_MAX_DISPLAY_DURATION_SECONDS,
    );

    return clampedSeconds * 1000;
};

const scheduleHideTimer = (durationMs: number = getDisplayDurationMs()) => {
    clearHideTimer();
    hideTimer = setTimeout(() => {
        requestCurrentSongOverlayDismissal();
    }, durationMs);
};

export const pauseCurrentSongOverlayDismissal = () => {
    clearHideTimer();
};

export const presentCurrentSongOverlay = () => {
    if (!settings$.overlay.enabled.get()) {
        cancelCurrentSongOverlay();
        return;
    }
    clearHideTimer();
    batch(() => {
        currentSongOverlay$.isExiting.set(false);
        currentSongOverlay$.isWindowOpen.set(true);
        const nextPresentationId = currentSongOverlay$.presentationId.get() + 1;
        currentSongOverlay$.presentationId.set(nextPresentationId);
    });
    scheduleHideTimer();
};

export const requestCurrentSongOverlayDismissal = () => {
    if (currentSongOverlay$.isExiting.get()) {
        return;
    }
    clearHideTimer();
    currentSongOverlay$.isExiting.set(true);
};

export const finalizeCurrentSongOverlayDismissal = () => {
    clearHideTimer();
    batch(() => {
        currentSongOverlay$.isExiting.set(false);
        currentSongOverlay$.isWindowOpen.set(false);
    });
};

export const cancelCurrentSongOverlay = () => {
    clearHideTimer();
    batch(() => {
        currentSongOverlay$.isExiting.set(false);
        currentSongOverlay$.isWindowOpen.set(false);
    });
};

export const resetCurrentSongOverlayTimer = () => {
    if (!currentSongOverlay$.isWindowOpen.get()) {
        return;
    }
    scheduleHideTimer();
};

export const setCurrentSongOverlayWindowHeight = (height: number) => {
    const normalizedHeight = Math.max(120, Math.round(height));
    if (currentSongOverlay$.windowHeight.get() === normalizedHeight) {
        return;
    }
    currentSongOverlay$.windowHeight.set(normalizedHeight);
};

export const setCurrentSongOverlayWindowWidth = (width: number) => {
    const normalizedWidth = Math.max(200, Math.round(width));
    if (currentSongOverlay$.windowWidth.get() === normalizedWidth) {
        return;
    }
    currentSongOverlay$.windowWidth.set(normalizedWidth);
};
