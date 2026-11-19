import { audioPlayer, type AudioPlayerEvents } from "@legend-apps/audio-player";
import { initializeLocalAudioPlayer, localPlayerState$ } from "../src/components/LocalAudioPlayer";

const mockAudioPlayer = audioPlayer as typeof audioPlayer & {
    __emit<K extends keyof AudioPlayerEvents>(event: K, payload: Parameters<AudioPlayerEvents[K]>[0]): void;
};

beforeAll(() => initializeLocalAudioPlayer());

it("requests one native progress update every five seconds", () => {
    expect(audioPlayer.setProgressUpdateInterval).toHaveBeenCalledWith(5);
});

it("advances the visible timeline between native updates", () => {
    jest.useFakeTimers();
    try {
        mockAudioPlayer.__emit("onProgress", { currentTime: 10, duration: 60 });
        mockAudioPlayer.__emit("onPlaybackStateChanged", { isPlaying: true });

        jest.advanceTimersByTime(1_000);
        expect(localPlayerState$.currentTime.peek()).toBeCloseTo(11);
        jest.advanceTimersByTime(2_000);
        expect(localPlayerState$.currentTime.peek()).toBeCloseTo(13);

        mockAudioPlayer.__emit("onPlaybackStateChanged", { isPlaying: false });
        jest.advanceTimersByTime(2_000);
        expect(localPlayerState$.currentTime.peek()).toBeCloseTo(13);
    } finally {
        mockAudioPlayer.__emit("onPlaybackStateChanged", { isPlaying: false });
        jest.useRealTimers();
    }
});
