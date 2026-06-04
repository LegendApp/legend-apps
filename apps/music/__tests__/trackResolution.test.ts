import { DEFAULT_LOCAL_PLAYLIST_ID } from "../src/systems/localMusicConstants";
import type { LocalTrack } from "../src/systems/LocalMusicState";
import { resolvePlaylistTracks } from "../src/utils/trackResolution";

const makeTrack = (id: string, overrides: Partial<LocalTrack> = {}): LocalTrack => ({
    id,
    filePath: `/music/${id}.mp3`,
    fileName: `${id}.mp3`,
    title: `Track ${id}`,
    artist: "Test Artist",
    duration: "3:30",
    ...overrides,
});

describe("resolvePlaylistTracks", () => {
    it("returns the full library when requesting the default playlist by id", () => {
        const tracks = [makeTrack("one"), makeTrack("two")];
        const lookup = new Map(tracks.map((track) => [track.filePath, track]));

        const result = resolvePlaylistTracks(
            { id: DEFAULT_LOCAL_PLAYLIST_ID, name: "All Songs" },
            tracks,
            lookup,
        );

        expect(result.tracks).toEqual(tracks);
        expect(result.missingPaths).toEqual([]);
    });

    it("returns empty results when no track paths are provided for other playlists", () => {
        const tracks = [makeTrack("one"), makeTrack("two")];
        const lookup = new Map(tracks.map((track) => [track.filePath, track]));

        const result = resolvePlaylistTracks(
            { id: "custom-playlist", name: "Weekend Mix", trackPaths: [] },
            tracks,
            lookup,
        );

        expect(result.tracks).toEqual([]);
        expect(result.missingPaths).toEqual([]);
    });
});
