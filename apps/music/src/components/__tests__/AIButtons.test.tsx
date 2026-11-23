import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { showToast } from "../Toast";
import { generatePlaylistExtension } from "../../systems/ai/playlistGeneration";
import type { PlaylistAIContext } from "../../systems/ai/playlistContext";
import type { LocalTrack } from "../../systems/LocalMusicState";
import { getCodexAvailability } from "@legendapp/spark/ai/codex";
import { spotifyStatus$ } from "../../providers/spotify/provider";
import { settings$ } from "../../systems/Settings";
import { showContextMenu } from "@legendapp/spark/context-menu";

jest.mock("@legendapp/spark/ai/codex", () => ({
    __esModule: true,
    getCodexAvailability: jest.fn(),
}));

jest.mock("@legendapp/spark/context-menu", () => ({
    __esModule: true,
    showContextMenu: jest.fn(),
}));

jest.mock("@legendapp/spark/windows", () => ({
    __esModule: true,
    useWindowId: () => "main",
}));

jest.mock("../Toast", () => ({
    __esModule: true,
    showToast: jest.fn(),
    useToast: jest.fn(() => mockShowToast),
}));

jest.mock("../TooltipProvider", () => ({
    __esModule: true,
    useTooltip: () => ({
        hideTooltip: jest.fn(),
        showTooltip: jest.fn(),
    }),
}));

jest.mock("../../systems/ai/playlistGeneration", () => ({
    __esModule: true,
    generatePlaylistExtension: jest.fn(),
}));

import { AIButtons } from "../AIButtons";

const mockGetCodexAvailability = getCodexAvailability as jest.MockedFunction<typeof getCodexAvailability>;
const mockGeneratePlaylistExtension = generatePlaylistExtension as jest.MockedFunction<typeof generatePlaylistExtension>;
const mockShowToast = showToast as jest.MockedFunction<typeof showToast>;
const mockShowContextMenu = showContextMenu as jest.MockedFunction<typeof showContextMenu>;

function createTrack(id: string): LocalTrack {
    return {
        id,
        filePath: `/music/${id}.mp3`,
        fileName: `${id}.mp3`,
        title: `Track ${id}`,
        artist: "Test Artist",
        duration: "1:00",
    };
}

function createPlaylist(overrides: Partial<PlaylistAIContext> = {}): PlaylistAIContext {
    return {
        id: "road-mix",
        name: "Road Mix",
        trackPaths: ["/music/a.mp3"],
        tracks: [{ id: "a", title: "Track a", artist: "Test Artist", filePath: "/music/a.mp3", duration: 60 }],
        trackCount: 1,
        ...overrides,
    };
}

function getText(node: ReactTestInstance | string): string {
    if (typeof node === "string") {
        return node;
    }

    return node.children.map((child) => getText(child as ReactTestInstance | string)).join("");
}

function findButton(renderer: ReactTestRenderer, text: string): ReactTestInstance {
    const button = renderer.root
        .findAll((node) => (node.type as unknown) === "Pressable")
        .find((node) => getText(node).includes(text) || String(node.props.accessibilityLabel ?? "").includes(text));

    if (!button) {
        throw new Error(`Button not found: ${text}`);
    }

    return button;
}

async function renderAIButtons({
    canUseAI = true,
    disabledReason,
    libraryTracks = [createTrack("a"), createTrack("b")],
    onAddTracks = jest.fn(() => ({ addedCount: 0 })),
    playlist = createPlaylist(),
}: {
    canUseAI?: boolean;
    disabledReason?: string;
    libraryTracks?: LocalTrack[];
    onAddTracks?: (tracks: LocalTrack[]) => { addedCount: number; targetName?: string; undo?: () => void };
    playlist?: PlaylistAIContext;
} = {}) {
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
        renderer = create(
            <AIButtons
                canUseAI={canUseAI}
                disabledReason={disabledReason}
                libraryTracks={libraryTracks}
                onAddTracks={onAddTracks}
                playlist={playlist}
            />,
        );
    });

    if (!renderer) {
        throw new Error("Failed to render AIButtons");
    }

    return renderer;
}

async function choose(renderer: ReactTestRenderer, itemId: string) {
    mockShowContextMenu.mockResolvedValueOnce({ canceled: false, itemId });
    await act(async () => {
        findButton(renderer, "AI playlist").props.onPress({ nativeEvent: { button: 0, pageX: 10, pageY: 20 } });
    });
}

function lastMenuItems() {
    return mockShowContextMenu.mock.calls.at(-1)![0].items;
}

describe("AIButtons", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        settings$.ai.defaultSources.set(["local", "spotify", "appleMusic"]);
        settings$.ai.playlistSourceOverrides.set({});
        settings$.ai.toolbarEnabled.set(true);
        spotifyStatus$.assign({ enabled: false, authenticated: false, error: null });
        mockShowContextMenu.mockResolvedValue({ canceled: true });
        mockGetCodexAvailability.mockResolvedValue({
            available: true,
            codexPath: "/usr/bin/codex",
            message: "Codex is ready.",
            userAgent: "codex-test",
        });
        mockGeneratePlaylistExtension.mockResolvedValue({
            rawResult: {
                model: "test-model",
                output: "{}",
                threadId: "thread-1",
                turnId: "turn-1",
                userAgent: "codex-test",
            },
            tracks: [createTrack("b")],
            unresolvedCount: 0,
        });
    });

    it("does not mount AI controls when AI playlists are disabled", async () => {
        settings$.ai.toolbarEnabled.set(false);
        const renderer = await renderAIButtons();

        expect(renderer.toJSON()).toBeNull();
        expect(mockGetCodexAvailability).not.toHaveBeenCalled();
        act(() => renderer.unmount());
    });

    it("renders only one small labeled icon button and no status text", async () => {
        const renderer = await renderAIButtons({ libraryTracks: [] });

        const buttons = renderer.root.findAll((node) => (node.type as unknown) === "Pressable");
        expect(buttons).toHaveLength(1);
        expect(buttons[0].props).toMatchObject({ accessibilityLabel: "AI playlist", accessibilityRole: "button" });
        expect(getText(renderer.root)).toBe("");
        act(() => renderer.unmount());
    });

    it.each([
        ["Codex is missing", { codex: false }, "Codex CLI was not found. Install Codex, then reopen the app."],
        ["the playlist cannot be edited", { canUseAI: false, disabledReason: "Clear the search first." }, "Clear the search first."],
        ["no source is available", { libraryTracks: [] }, "None of the selected music sources are available. Add a local library, connect a selected service, or choose other sources."],
    ] as const)("explains in a toast when %s", async (_name, options, message) => {
        if ("codex" in options) {
            mockGetCodexAvailability.mockResolvedValue({ available: false, codexPath: "", message, userAgent: "" });
        }
        const renderer = await renderAIButtons(options as never);

        await choose(renderer, "auto");

        expect(mockGeneratePlaylistExtension).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith(message, "error");
        act(() => renderer.unmount());
    });

    it("disables Add Similar Songs for an empty playlist", async () => {
        const renderer = await renderAIButtons({ playlist: createPlaylist({ trackPaths: [], tracks: [], trackCount: 0 }) });

        await choose(renderer, "settings");

        expect(lastMenuItems()[0]).toMatchObject({ id: "auto", disabled: true });
        act(() => renderer.unmount());
    });

    it("stores and clears a playlist-specific source override from the menu", async () => {
        const renderer = await renderAIButtons();

        await choose(renderer, "source:spotify");
        expect(settings$.ai.playlistSourceOverrides["road-mix"].peek()).toEqual(["local", "appleMusic"]);

        await choose(renderer, "defaults");
        expect(lastMenuItems()).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "source:spotify", checked: false }),
            expect.objectContaining({ id: "defaults", hidden: false }),
        ]));
        expect(settings$.ai.playlistSourceOverrides["road-mix"].peek()).toBeUndefined();
        act(() => renderer.unmount());
    });

    it("generates from an inline prompt for an empty playlist", async () => {
        const onAddTracks = jest.fn(() => ({ addedCount: 1, targetName: "Queue" }));
        const renderer = await renderAIButtons({
            onAddTracks,
            playlist: createPlaylist({ name: "Queue", trackPaths: [], tracks: [], trackCount: 0 }),
        });

        await choose(renderer, "prompt");
        const input = renderer.root.findByType("TextInput" as never);
        await act(async () => input.props.onChangeText("more energy"));
        expect(findButton(renderer, "Generate").props.disabled).toBe(false);
        await act(async () => input.props.onSubmitEditing());

        expect(mockGeneratePlaylistExtension).toHaveBeenCalledWith(expect.objectContaining({
            playlist: expect.objectContaining({ name: "Queue", trackPaths: [] }),
            sources: ["local", "spotify", "appleMusic"],
            userPrompt: "more energy",
        }));
        expect(onAddTracks).toHaveBeenCalledWith([expect.objectContaining({ filePath: "/music/b.mp3" })]);
        expect(mockShowToast).toHaveBeenCalledWith("Added 1 track to Queue", "info", undefined);
        expect(renderer.root.findAllByType("TextInput" as never)).toHaveLength(0);
        act(() => renderer.unmount());
    });

    it("cancels the prompt and clears its text", async () => {
        const renderer = await renderAIButtons();
        await choose(renderer, "prompt");
        await act(async () => renderer.root.findByType("TextInput" as never).props.onChangeText("x"));
        await act(async () => findButton(renderer, "Cancel prompt").props.onPress({ nativeEvent: { button: 0 } }));
        expect(renderer.root.findAllByType("TextInput" as never)).toHaveLength(0);

        await choose(renderer, "prompt");
        expect(renderer.root.findByType("TextInput" as never).props.value).toBe("");
        act(() => renderer.unmount());
    });

    it("shows a spinner instead of the button while generating, and passes Undo through the toast", async () => {
        let finish!: (value: Awaited<ReturnType<typeof generatePlaylistExtension>>) => void;
        mockGeneratePlaylistExtension.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
        const undo = jest.fn();
        const renderer = await renderAIButtons({
            onAddTracks: jest.fn(() => ({ addedCount: 1, targetName: "Road Mix", undo })),
        });

        await choose(renderer, "auto");
        expect(renderer.root.findAll((node) => (node.type as unknown) === "Pressable")).toHaveLength(0);
        await act(async () => finish({ tracks: [createTrack("b")], unresolvedCount: 0, rawResult: { model: "test", output: "{}", threadId: "1", turnId: "1", userAgent: "test" } }));

        expect(findButton(renderer, "AI playlist")).toBeDefined();
        const toastAction = mockShowToast.mock.calls[0]?.[2];
        expect(toastAction).toMatchObject({ label: "Undo" });
        toastAction?.onPress?.();
        expect(undo).toHaveBeenCalledTimes(1);
        act(() => renderer.unmount());
    });

    it("toasts generation errors", async () => {
        mockGeneratePlaylistExtension.mockRejectedValue(new Error("Run `codex login` in Terminal."));
        const renderer = await renderAIButtons();

        await choose(renderer, "auto");

        expect(mockShowToast).toHaveBeenCalledWith("Run `codex login` in Terminal.", "error");
        act(() => renderer.unmount());
    });
});
