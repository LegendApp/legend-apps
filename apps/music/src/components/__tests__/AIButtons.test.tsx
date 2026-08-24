import React from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { showToast } from "../Toast";
import { generatePlaylistExtension } from "../../systems/ai/playlistGeneration";
import type { PlaylistAIContext } from "../../systems/ai/playlistContext";
import type { LocalTrack } from "../../systems/LocalMusicState";
import { getCodexAvailability } from "@legend-apps/codex";

jest.mock("@legend-apps/codex", () => ({
    __esModule: true,
    getCodexAvailability: jest.fn(),
}));

jest.mock("../Toast", () => ({
    __esModule: true,
    showToast: jest.fn(),
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
        .find((node) => getText(node).includes(text));

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

describe("AIButtons", () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

    it("disables both buttons when no AI command is available", async () => {
        mockGetCodexAvailability.mockResolvedValue({
            available: false,
            codexPath: "",
            message: "Codex CLI was not found. Install Codex, then reopen the app.",
            userAgent: "",
        });

        const renderer = await renderAIButtons();

        expect(findButton(renderer, "Auto").props.disabled).toBe(true);
        expect(findButton(renderer, "Prompt").props.disabled).toBe(true);
        expect(getText(renderer.root)).toContain("Codex CLI was not found");

        act(() => {
            renderer.unmount();
        });
    });

    it("shows why AI is unavailable for the current playlist", async () => {
        const renderer = await renderAIButtons({
            canUseAI: false,
            disabledReason: "Clear the search before editing this playlist with AI.",
        });

        expect(findButton(renderer, "Auto").props.disabled).toBe(true);
        expect(findButton(renderer, "Prompt").props.disabled).toBe(true);
        expect(getText(renderer.root)).toContain("Clear the search before editing this playlist with AI.");

        act(() => {
            renderer.unmount();
        });
    });

    it("shows command availability errors", async () => {
        mockGetCodexAvailability.mockRejectedValue(new Error("native app-server unavailable"));

        const renderer = await renderAIButtons();

        expect(getText(renderer.root)).toContain(
            "Could not start Codex: native app-server unavailable",
        );

        act(() => {
            renderer.unmount();
        });
    });

    it("shows when the local library is empty", async () => {
        const renderer = await renderAIButtons({ libraryTracks: [] });

        expect(findButton(renderer, "Auto").props.disabled).toBe(true);
        expect(findButton(renderer, "Prompt").props.disabled).toBe(true);
        expect(getText(renderer.root)).toContain(
            "No library songs are available. Add or re-authorize a folder in Settings, then rescan.",
        );

        act(() => {
            renderer.unmount();
        });
    });

    it("disables Auto but keeps Prompt available for an empty playlist", async () => {
        const renderer = await renderAIButtons({
            playlist: createPlaylist({ trackPaths: [], tracks: [], trackCount: 0 }),
        });

        expect(findButton(renderer, "Auto").props.disabled).toBe(true);
        expect(findButton(renderer, "Prompt").props.disabled).toBe(false);
        expect(getText(renderer.root)).toContain("Add a seed track for Auto");

        act(() => {
            renderer.unmount();
        });
    });

    it("exposes the AI controls as labeled buttons", async () => {
        const renderer = await renderAIButtons();

        expect(findButton(renderer, "Auto").props).toMatchObject({
            accessibilityLabel: "Auto",
            accessibilityRole: "button",
        });
        expect(findButton(renderer, "Prompt").props).toMatchObject({
            accessibilityLabel: "Prompt",
            accessibilityRole: "button",
        });

        act(() => {
            renderer.unmount();
        });
    });

    it("keeps generation errors visible after the toast", async () => {
        mockGeneratePlaylistExtension.mockRejectedValue(new Error("Run `codex login` in Terminal."));
        const renderer = await renderAIButtons();

        await act(async () => {
            findButton(renderer, "Auto").props.onPress({ nativeEvent: { button: 0 } });
            await Promise.resolve();
        });

        expect(getText(renderer.root)).toContain("Run `codex login` in Terminal.");
        expect(mockShowToast).toHaveBeenCalledWith("Run `codex login` in Terminal.", "error");

        act(() => {
            renderer.unmount();
        });
    });

    it("generates from Prompt for an empty playlist", async () => {
        const onAddTracks = jest.fn(() => ({ addedCount: 1, targetName: "Queue" }));
        const renderer = await renderAIButtons({
            onAddTracks,
            playlist: createPlaylist({ name: "Queue", trackPaths: [], tracks: [], trackCount: 0 }),
        });

        await act(async () => {
            findButton(renderer, "Prompt").props.onPress({ nativeEvent: { button: 0 } });
        });

        const input = renderer.root.findByType("TextInput" as any);
        await act(async () => {
            input.props.onChangeText("more energy");
        });
        await act(async () => {
            findButton(renderer, "Generate").props.onPress({ nativeEvent: { button: 0 } });
        });

        expect(mockGeneratePlaylistExtension).toHaveBeenCalledWith(
            expect.objectContaining({
                playlist: expect.objectContaining({ name: "Queue", trackPaths: [] }),
                userPrompt: "more energy",
            }),
        );
        expect(onAddTracks).toHaveBeenCalledWith([expect.objectContaining({ filePath: "/music/b.mp3" })]);
        expect(mockShowToast).toHaveBeenCalledWith("Added 1 track to Queue", "info", undefined);

        act(() => {
            renderer.unmount();
        });
    });

    it("passes Undo through the success toast", async () => {
        const undo = jest.fn();
        const renderer = await renderAIButtons({
            onAddTracks: jest.fn(() => ({ addedCount: 1, targetName: "Road Mix", undo })),
        });

        await act(async () => {
            findButton(renderer, "Auto").props.onPress({ nativeEvent: { button: 0 } });
        });

        const toastAction = mockShowToast.mock.calls[0]?.[2];
        expect(toastAction).toMatchObject({ label: "Undo" });
        toastAction?.onPress?.();
        expect(undo).toHaveBeenCalledTimes(1);

        act(() => {
            renderer.unmount();
        });
    });
});
