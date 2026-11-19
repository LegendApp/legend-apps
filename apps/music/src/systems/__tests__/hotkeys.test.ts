import { loadMusicHotkeyFile } from "../hotkeys";

describe("loadMusicHotkeyFile", () => {
    it("migrates bindings saved as legacy key codes", () => {
        const file = loadMusicHotkeyFile({
            version: 1,
            bindings: { Search: ["38"], ToggleShuffle: ["524288+1"], PlayPause: ["10001", "49"], NextTrack: ["10002"] },
        });

        expect(file.bindings.Search).toEqual(["J"]);
        expect(file.bindings.ToggleShuffle).toEqual(["Alt+S"]);
        expect(file.bindings.PlayPause).toEqual(["MediaPlayPause", "Space"]);
        expect(file.bindings.NextTrack).toEqual(["MediaNext"]);
        expect(file.bindings.ToggleLibrary).toEqual(["L"]);
    });

    it("keeps current accelerator bindings and falls back to defaults for unreadable ones", () => {
        const file = loadMusicHotkeyFile({ version: 1, bindings: { Search: ["Cmd+K"], ToggleLibrary: ["not a key"] } });

        expect(file.bindings.Search).toEqual(["Cmd+K"]);
        expect(file.bindings.ToggleLibrary).toEqual(["L"]);
    });

    it("migrates the original app's flat hotkeys file, merging PlayPauseSpace into PlayPause", () => {
        const file = loadMusicHotkeyFile({
            Search: "K",
            ToggleLibrary: 37,
            ToggleVisualizer: "V",
            PlayPause: "Play/Pause",
            PlayPauseSpace: "Space",
            NextTrack: "Next Track",
            PreviousTrack: "Previous Track",
            ToggleShuffle: "⌘+⇧+S",
            ToggleRepeatMode: "⌥+R",
            Up: "↑",
            Delete: "⌫",
        });

        expect(file.bindings).toEqual({
            Search: ["K"],
            ToggleLibrary: ["L"],
            PlayPause: ["MediaPlayPause", "Space"],
            NextTrack: ["MediaNext"],
            PreviousTrack: ["MediaPrevious"],
            ToggleShuffle: ["Cmd+Shift+S"],
            ToggleRepeatMode: ["Alt+R"],
        });
    });
});
