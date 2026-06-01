import { observable } from "@legendapp/state";

export const playbackInteractionState$ = observable({
    isScrubbing: false,
});

export function setIsScrubbing(isScrubbing: boolean): void {
    playbackInteractionState$.isScrubbing.set(isScrubbing);
}
