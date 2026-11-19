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
});
