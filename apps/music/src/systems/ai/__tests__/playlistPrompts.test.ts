import { buildPlaylistExtensionPrompt } from "../playlistPrompts";
import type { LocalPlaylist } from "@/systems/LocalMusicState";

const playlist: LocalPlaylist = {
    id: "playlist",
    name: "Road Trip",
    filePath: "/playlists/road-trip.m3u",
    trackPaths: ["/music/a.mp3"],
    tracks: [{ id: "a", filePath: "/music/a.mp3", title: "Song A", artist: "Artist A", duration: 180 }],
    trackCount: 1,
    source: "cache",
};

describe("buildPlaylistExtensionPrompt", () => {
    it("includes playlist context, user prompt, count, and local catalog", () => {
        const prompt = buildPlaylistExtensionPrompt({
            catalog: {
                jsonLines: JSON.stringify({ filePath: "/music/b.mp3", title: "Song B", artist: "Artist B" }),
                count: 1,
                omittedCount: 0,
            },
            playlist,
            targetCount: 20,
            userPrompt: "more upbeat",
        });

        expect(prompt).toContain("Playlist name: Road Trip");
        expect(prompt).toContain("User request: more upbeat");
        expect(prompt).toContain("Artist A - Song A");
        expect(prompt).toContain("Return up to 20 new tracks");
        expect(prompt).toContain("Only choose tracks from the local library catalog");
        expect(prompt).toContain("/music/b.mp3");
    });
});
