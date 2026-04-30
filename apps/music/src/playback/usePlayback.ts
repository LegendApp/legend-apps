import { useEffect, useSyncExternalStore } from "react";
import { getPlaybackSnapshot, initializePlayback, subscribePlayback } from "./playbackStore";

export function usePlayback() {
  useEffect(() => {
    void initializePlayback();
  }, []);

  return useSyncExternalStore(subscribePlayback, getPlaybackSnapshot, getPlaybackSnapshot);
}
