import type { M3UTrack } from "@/utils/m3u";

export type PlaylistAIContext = {
    name: string;
    trackPaths: string[];
    tracks?: M3UTrack[];
    trackCount: number;
};
