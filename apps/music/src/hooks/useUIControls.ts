import { useValue } from "@legendapp/state/react";
import type { PlaybackControlId, UIControlLayout } from "@/systems/Settings";
import { settings$ } from "@/systems/Settings";

export function usePlaybackControlLayout(): UIControlLayout<PlaybackControlId> {
    return useValue(settings$.ui.playback) ?? ({ shown: [] } as UIControlLayout<PlaybackControlId>);
}
