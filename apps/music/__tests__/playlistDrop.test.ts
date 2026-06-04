import { filterTracksForInsert } from "../src/components/Playlist";
import type { LocalTrack } from "../src/systems/LocalMusicState";

const makeQueueItem = (id: string, overrides: Partial<{ filePath: string }> = {}) => ({
    id,
    filePath: overrides.filePath ?? `/incoming/${id}.mp3`,
    queueEntryId: `existing-${id}`,
});

type QueueItem = ReturnType<typeof makeQueueItem>;

const makeTrack = (id: string, overrides: Partial<LocalTrack> = {}): LocalTrack => ({
    id,
    filePath: `/incoming/${id}.mp3`,
    fileName: `${id}.mp3`,
    title: `Incoming ${id}`,
    artist: "Drop Artist",
    duration: "1:00",
    ...overrides,
});

describe("filterTracksForInsert", () => {
    it("includes tracks already present in the queue", () => {
        const existing: QueueItem[] = [makeQueueItem("a")];
        const incoming = [makeTrack("a"), makeTrack("b")];

        const result = filterTracksForInsert(existing, incoming);

        expect(result.filtered.map((track) => track.id)).toEqual(["a", "b"]);
        expect(result.skipped).toBe(0);
    });

    it("keeps duplicate tracks within the drop payload", () => {
        const existing: QueueItem[] = [makeQueueItem("duplicate", { filePath: "/shared/path.mp3" })];
        const incoming = [
            makeTrack("unique-1"),
            makeTrack("duplicate", { filePath: "/shared/path.mp3" }),
            makeTrack("duplicate-again", { filePath: "/shared/path.mp3" }),
            makeTrack("unique-2"),
        ];

        const result = filterTracksForInsert(existing, incoming);

        expect(result.filtered.map((track) => track.id)).toEqual([
            "unique-1",
            "duplicate",
            "duplicate-again",
            "unique-2",
        ]);
        expect(result.skipped).toBe(0);
    });

    it("allows tracks without identifiers to pass through", () => {
        const existing: QueueItem[] = [];
        const incoming = [
            makeTrack("no-id", { id: "", filePath: "" }),
            makeTrack("with-id"),
        ];

        const result = filterTracksForInsert(existing, incoming);

        expect(result.filtered.map((track) => track.id)).toEqual(["", "with-id"]);
        expect(result.skipped).toBe(0);
    });
});
