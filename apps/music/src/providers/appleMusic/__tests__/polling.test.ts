import { getAppleMusic } from "@legend-apps/apple-music";
import { settings$ } from "../../../systems/Settings";
import { appleMusicProvider } from "../provider";

const native = getAppleMusic() as jest.Mocked<ReturnType<typeof getAppleMusic>>;
const track = { id: "appleMusic:1", title: "Song", artist: "Artist", filePath: "applemusic:song:1", fileName: "Song", duration: "2:00" };

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    settings$.providers.appleMusic.assign({ enabled: true, connected: true });
    native.getAuthorization.mockResolvedValue({ authorized: true } as never);
    native.getPlaybackState.mockResolvedValue({ isPlaying: true, positionSeconds: 10, durationSeconds: 120 } as never);
});
afterEach(() => jest.useRealTimers());

test("polls during playback, stops when paused, and resumes on play", async () => {
    const updates = jest.fn();
    const unsubscribe = appleMusicProvider.playback.subscribe(updates);
    try {
        await appleMusicProvider.playback.load(track);
        await jest.advanceTimersByTimeAsync(1000);
        expect(native.getPlaybackState).toHaveBeenCalledTimes(1);
        await appleMusicProvider.playback.pause();
        await jest.advanceTimersByTimeAsync(5000);
        expect(native.getPlaybackState).toHaveBeenCalledTimes(1);
        expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({ isPlaying: false }));
        await appleMusicProvider.playback.play();
        await jest.advanceTimersByTimeAsync(1000);
        expect(native.getPlaybackState).toHaveBeenCalledTimes(2);
        await appleMusicProvider.playback.stop();
        await jest.advanceTimersByTimeAsync(5000);
        expect(native.getPlaybackState).toHaveBeenCalledTimes(2);
    } finally { unsubscribe(); }
});

test("an in-flight playing result cannot restart progress after pause", async () => {
    let finish!: (value: never) => void;
    native.getPlaybackState.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const updates = jest.fn();
    const unsubscribe = appleMusicProvider.playback.subscribe(updates);
    try {
        await appleMusicProvider.playback.load(track);
        await jest.advanceTimersByTimeAsync(1000);
        await appleMusicProvider.playback.pause();
        updates.mockClear();
        finish({ isPlaying: true, positionSeconds: 10 } as never);
        await Promise.resolve();
        expect(updates).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
});
