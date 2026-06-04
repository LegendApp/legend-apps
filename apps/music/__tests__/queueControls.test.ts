import { localAudioControls, localPlayerState$, queue$ } from "../src/components/LocalAudioPlayer";
import type { LocalTrack } from "../src/systems/LocalMusicState";

function createQueuedTrack(id: string, overrides: Partial<LocalTrack> = {}) {
    return {
        id,
        filePath: `/music/${id}.mp3`,
        fileName: `${id}.mp3`,
        title: `Track ${id}`,
        artist: "Test Artist",
        duration: "1:00",
        queueEntryId: `queue-${id}`,
        ...overrides,
    };
}

function createTrack(id: string, overrides: Partial<LocalTrack> = {}): LocalTrack {
    return {
        id,
        filePath: `/music/${id}.mp3`,
        fileName: `${id}.mp3`,
        title: `Track ${id}`,
        artist: "Test Artist",
        duration: "1:00",
        ...overrides,
    };
}

describe("queueControls.insertAt", () => {
    beforeEach(() => {
        queue$.tracks.set([createQueuedTrack("a"), createQueuedTrack("b"), createQueuedTrack("c")]);
        localPlayerState$.currentIndex.set(1);
        localPlayerState$.currentTrack.set(createTrack("b"));
    });

    afterEach(() => {
        queue$.tracks.set([]);
        localPlayerState$.currentIndex.set(-1);
        localPlayerState$.currentTrack.set(null);
    });

    it("inserts tracks at the requested position", () => {
        const newTrack = createTrack("mid");

        localAudioControls.queue.insertAt(1, newTrack);

        const tracks = queue$.tracks.get();
        expect(tracks).toHaveLength(4);
        expect(tracks[1]?.id).toBe("mid");
    });

    it("shifts the current index forward when inserting before the playing track", () => {
        const newTrack = createTrack("before-current");

        localAudioControls.queue.insertAt(1, newTrack);

        expect(localPlayerState$.currentIndex.get()).toBe(2);
    });

    it("keeps the current index when inserting after the playing track", () => {
        const newTrack = createTrack("after-current");

        localAudioControls.queue.insertAt(3, newTrack);

        expect(localPlayerState$.currentIndex.get()).toBe(1);
    });
});

describe("queueControls queue invariants", () => {
    beforeEach(() => {
        queue$.tracks.set([createQueuedTrack("a"), createQueuedTrack("b"), createQueuedTrack("c")]);
        localPlayerState$.currentIndex.set(1);
        localPlayerState$.currentTrack.set(queue$.tracks.peek()[1] ?? null);
        localPlayerState$.isPlaying.set(false);
    });

    afterEach(() => {
        queue$.tracks.set([]);
        localPlayerState$.currentIndex.set(-1);
        localPlayerState$.currentTrack.set(null);
        localPlayerState$.isPlaying.set(false);
    });

    it("keeps the current track selected when removing tracks before it", () => {
        localAudioControls.queue.remove([0]);

        expect(queue$.tracks.get().map((track) => track.id)).toEqual(["b", "c"]);
        expect(localPlayerState$.currentIndex.get()).toBe(0);
    });

    it("moves playback to the next remaining track when removing the current track", () => {
        localPlayerState$.isPlaying.set(true);

        localAudioControls.queue.remove([1]);

        expect(queue$.tracks.get().map((track) => track.id)).toEqual(["a", "c"]);
        expect(localPlayerState$.currentIndex.get()).toBe(1);
    });

    it("preserves the current track identity when reordering the queue", () => {
        const current = queue$.tracks.peek()[1];
        localPlayerState$.currentTrack.set(current ?? null);

        localAudioControls.queue.reorder(1, 3);

        expect(queue$.tracks.get().map((track) => track.id)).toEqual(["a", "c", "b"]);
        expect(localPlayerState$.currentIndex.get()).toBe(2);
    });

    it("replaces the queue and starts from the requested index", () => {
        localAudioControls.queue.replace([createTrack("x"), createTrack("y"), createTrack("z")], {
            playImmediately: false,
            startIndex: 2,
        });

        expect(queue$.tracks.get().map((track) => track.id)).toEqual(["x", "y", "z"]);
        expect(localPlayerState$.currentIndex.get()).toBe(2);
        expect(localPlayerState$.currentTrack.get()?.id).toBe("z");
    });
});
