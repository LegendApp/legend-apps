import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { checkForUpdates } from "@legendapp/spark/updates";
import { useMenu, type MenuItem } from "@legendapp/spark/menus";

import { localAudioControls, localPlayerState$, queue$ } from "../../components/LocalAudioPlayer";
import { savePlaylistUI$ } from "../../state/savePlaylistUIState";
import { AppMenuController } from "../AppMenu.macos";
import { settings$ } from "../Settings";
import { state$, stateSaved$ } from "../State";
import { hotkeys$ } from "../hotkeys";
import { KeyCodes } from "../keyboard/KeyboardManager";
import type { LocalTrack } from "../LocalMusicState";

function menu() { return jest.mocked(useMenu).mock.calls.at(-1)![0]; }
function items(): MenuItem[] { return menu().items.flatMap(item => item.type === "submenu" ? item.items : [item]); }
function click(itemId: string) { menu().onAction?.({ type: "action", itemId }); }

function createQueuedTrack(id: string): LocalTrack & { queueEntryId: string } {
    return {
        id,
        filePath: `/music/${id}.mp3`,
        fileName: `${id}.mp3`,
        title: `Track ${id}`,
        artist: "Test Artist",
        duration: "1:00",
        queueEntryId: `queue-${id}`,
    };
}

function renderController() {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
        renderer = TestRenderer.create(<AppMenuController />);
    });
    return renderer;
}

describe("AppMenuController", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        queue$.tracks.set([]);
        localPlayerState$.isPlaying.set(false);
        savePlaylistUI$.isOpen.set(false);
        settings$.playback.shuffle.set(false);
        settings$.playback.repeatMode.set("off");
        state$.showSettings.set(false);
        stateSaved$.libraryIsOpen.set(false);
        hotkeys$.set({
            ...hotkeys$.peek(),
            ToggleShuffle: ["Cmd+S"],
        });
    });

    afterEach(() => {
        queue$.tracks.set([]);
        localPlayerState$.isPlaying.set(false);
        savePlaylistUI$.isOpen.set(false);
        settings$.playback.shuffle.set(false);
        settings$.playback.repeatMode.set("off");
        state$.showSettings.set(false);
        stateSaved$.libraryIsOpen.set(false);
    });

    it("configures the migrated music menus", () => {
        const renderer = renderController();

        expect(menu().id).toBe("music");
        expect(menu().items.map(item => item.id)).toEqual(["app", "file", "view", "playback"]);
        expect(items().filter(item => item.type !== "separator").map(item => item.id)).toEqual([
            "settings", "checkForUpdates", "savePlaylist", "jump", "toggleLibrary",
            "playbackPrevious", "playbackPlayPause", "playbackNext", "playbackToggleShuffle", "playbackToggleRepeat",
        ]);
        expect(menu().items[3]).toMatchObject({ placement: { before: { menu: "window" } } });
        act(() => renderer?.unmount());
    });

    it("handles native menu actions for app, file, view, playback, and updater commands", async () => {
        const renderer = renderController();
        const playPrevious = jest.spyOn(localAudioControls, "playPrevious").mockImplementation(() => {});
        const playNext = jest.spyOn(localAudioControls, "playNext").mockImplementation(() => {});
        const togglePlayPause = jest.spyOn(localAudioControls, "togglePlayPause").mockResolvedValue();

        queue$.tracks.set([createQueuedTrack("a")]);

        await act(async () => {
            click("settings");
            click("savePlaylist");
            click("toggleLibrary");
            click("playbackPrevious");
            click("playbackPlayPause");
            click("playbackNext");
            click("playbackToggleShuffle");
            click("playbackToggleRepeat");
            click("checkForUpdates");
        });

        expect(state$.showSettings.get()).toBe(true);
        expect(savePlaylistUI$.isOpen.get()).toBe(true);
        expect(stateSaved$.libraryIsOpen.get()).toBe(true);
        expect(playPrevious).toHaveBeenCalledTimes(1);
        expect(togglePlayPause).toHaveBeenCalledTimes(1);
        expect(playNext).toHaveBeenCalledTimes(1);
        expect(settings$.playback.shuffle.get()).toBe(true);
        expect(settings$.playback.repeatMode.get()).toBe("all");
        expect(checkForUpdates).toHaveBeenCalledTimes(1);

        act(() => {
            renderer?.unmount();
        });
    });

    it("syncs dynamic menu labels, checks, enabled state, and shortcuts", () => {
        const renderer = renderController();

        act(() => {
            localPlayerState$.isPlaying.set(true);
            settings$.playback.shuffle.set(true);
            settings$.playback.repeatMode.set("one");
            stateSaved$.libraryIsOpen.set(true);
            queue$.tracks.set([createQueuedTrack("a")]);
        });

        expect(items()).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "playbackPlayPause", label: "Pause" }),
            expect.objectContaining({ id: "playbackToggleShuffle", checked: true, shortcut: "Cmd+S" }),
            expect.objectContaining({ id: "playbackToggleRepeat", checked: true, label: "Repeat One" }),
            expect.objectContaining({ id: "toggleLibrary", checked: true }),
            expect.objectContaining({ id: "savePlaylist", disabled: false }),
        ]));

        act(() => {
            renderer?.unmount();
        });
    });
});
