import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AutoUpdater } from "@legend-apps/auto-updater";
import {
    clearMenus,
    configureMenus,
    type NativeMenuAction,
    updateMenuItems,
} from "@legend-apps/native-menu";

import { localAudioControls, localPlayerState$, queue$ } from "../../components/LocalAudioPlayer";
import { savePlaylistUI$ } from "../../state/savePlaylistUIState";
import { AppMenuController } from "../AppMenu.macos";
import { settings$ } from "../Settings";
import { state$, stateSaved$ } from "../State";
import { hotkeys$ } from "../hotkeys";
import { KeyCodes } from "../keyboard/KeyboardManager";
import type { LocalTrack } from "../LocalMusicState";

const menuOwnerId = "music";
const { __emitNativeMenuAction } = require("@legend-apps/native-menu") as {
    __emitNativeMenuAction(action: NativeMenuAction): void;
};

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
            ToggleShuffle: [`${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.KEY_S}`],
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

        expect(configureMenus).toHaveBeenCalledTimes(1);
        const [ownerId, menus] = jest.mocked(configureMenus).mock.calls[0];
        const menuIds = menus.map((menu) => menu.id);
        const itemIds = menus.flatMap((menu) => menu.items.map((item) => item.id));

        expect(ownerId).toBe(menuOwnerId);
        expect(menuIds).toEqual(["app", "file", "view", "playback"]);
        expect(itemIds).toEqual([
            "settings",
            "checkForUpdates",
            "savePlaylist",
            "jump",
            "toggleLibrary",
            "playbackPrevious",
            "playbackPlayPause",
            "playbackNext",
            "playbackSeparator",
            "playbackToggleShuffle",
            "playbackToggleRepeat",
        ]);
        expect(menus.find((menu) => menu.id === "playback")?.placement).toEqual({ before: "Window" });

        act(() => {
            renderer?.unmount();
        });
        expect(clearMenus).toHaveBeenCalledWith(menuOwnerId);
    });

    it("handles native menu actions for app, file, view, playback, and updater commands", async () => {
        const renderer = renderController();
        const playPrevious = jest.spyOn(localAudioControls, "playPrevious").mockImplementation(() => {});
        const playNext = jest.spyOn(localAudioControls, "playNext").mockImplementation(() => {});
        const togglePlayPause = jest.spyOn(localAudioControls, "togglePlayPause").mockResolvedValue();

        queue$.tracks.set([createQueuedTrack("a")]);

        await act(async () => {
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "app", itemId: "settings" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "file", itemId: "savePlaylist" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "view", itemId: "toggleLibrary" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "playback", itemId: "playbackPrevious" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "playback", itemId: "playbackPlayPause" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "playback", itemId: "playbackNext" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "playback", itemId: "playbackToggleShuffle" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "playback", itemId: "playbackToggleRepeat" });
            __emitNativeMenuAction({ ownerId: menuOwnerId, menuId: "app", itemId: "checkForUpdates" });
        });

        expect(state$.showSettings.get()).toBe(true);
        expect(savePlaylistUI$.isOpen.get()).toBe(true);
        expect(stateSaved$.libraryIsOpen.get()).toBe(true);
        expect(playPrevious).toHaveBeenCalledTimes(1);
        expect(togglePlayPause).toHaveBeenCalledTimes(1);
        expect(playNext).toHaveBeenCalledTimes(1);
        expect(settings$.playback.shuffle.get()).toBe(true);
        expect(settings$.playback.repeatMode.get()).toBe("all");
        expect(AutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

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

        const patches = jest.mocked(updateMenuItems).mock.calls.flatMap(([, items]) => items);

        expect(patches).toEqual(expect.arrayContaining([{ id: "playbackPlayPause", title: "Pause" }]));
        expect(patches).toEqual(expect.arrayContaining([{ id: "playbackToggleShuffle", checked: true }]));
        expect(patches).toEqual(
            expect.arrayContaining([{ id: "playbackToggleRepeat", checked: true, title: "Repeat One" }]),
        );
        expect(patches).toEqual(expect.arrayContaining([{ id: "toggleLibrary", checked: true }]));
        expect(patches).toEqual(expect.arrayContaining([{ id: "savePlaylist", enabled: true }]));
        expect(patches).toEqual(
            expect.arrayContaining([
                {
                    id: "playbackToggleShuffle",
                    shortcut: { key: "s", modifiers: KeyCodes.MODIFIER_COMMAND },
                },
            ]),
        );

        act(() => {
            renderer?.unmount();
        });
    });
});
