import {
    getAICommandAvailability,
    runAITool,
    type AIToolRunResult,
} from "@legend-desktop/ai";
import { commandRunner, type CommandRunner } from "@legend-desktop/command-runner";
import type { LocalTrack } from "@/systems/LocalMusicState";
import { buildPlaylistAICatalog } from "./libraryCatalog";
import { parsePlaylistAISuggestions } from "./parser";
import type { PlaylistAIContext } from "./playlistContext";
import { buildPlaylistExtensionPrompt } from "./playlistPrompts";
import { resolvePlaylistAISuggestions } from "./resolver";

export type GeneratePlaylistExtensionOptions = {
    libraryTracks: LocalTrack[];
    playlist: PlaylistAIContext;
    runner?: CommandRunner;
    targetCount?: number;
    timeoutMs?: number;
    userPrompt?: string;
};

export type GeneratePlaylistExtensionResult = {
    rawResult: AIToolRunResult;
    tracks: LocalTrack[];
    unresolvedCount: number;
};

const defaultTargetCount = 20;
const defaultTimeoutMs = 60000;

export async function generatePlaylistExtension({
    libraryTracks,
    playlist,
    runner = commandRunner,
    targetCount = defaultTargetCount,
    timeoutMs = defaultTimeoutMs,
    userPrompt,
}: GeneratePlaylistExtensionOptions): Promise<GeneratePlaylistExtensionResult> {
    const trimmedPrompt = userPrompt?.trim() ?? "";

    if (playlist.trackPaths.length === 0 && !trimmedPrompt) {
        throw new Error("Add tracks to the playlist or enter a prompt first.");
    }
    if (libraryTracks.length === 0) {
        throw new Error("Scan your local library before using AI playlist generation.");
    }

    const catalog = buildPlaylistAICatalog(libraryTracks, { excludePaths: playlist.trackPaths });
    if (catalog.count === 0) {
        throw new Error("No new local library tracks are available for this playlist.");
    }

    const availability = await getAICommandAvailability(runner);
    const tool = availability.preferredTool;
    if (!tool) {
        throw new Error("Claude or Codex CLI is not available.");
    }

    const prompt = buildPlaylistExtensionPrompt({
        catalog,
        playlist,
        targetCount,
        userPrompt: trimmedPrompt,
    });
    const rawResult = await runAITool({
        prompt,
        runner,
        timeoutMs,
        tool,
    });

    if (rawResult.timedOut) {
        throw new Error("AI playlist generation timed out.");
    }
    if (rawResult.exitCode !== 0) {
        throw new Error(`${tool} failed to generate playlist suggestions.`);
    }

    const suggestions = parsePlaylistAISuggestions(rawResult.output);
    if (suggestions.length === 0) {
        throw new Error("AI response did not include any playlist suggestions.");
    }

    const resolved = resolvePlaylistAISuggestions(suggestions, libraryTracks, playlist.trackPaths);
    if (resolved.tracks.length === 0) {
        throw new Error("AI did not suggest any new tracks from your local library.");
    }

    return {
        rawResult,
        tracks: resolved.tracks.slice(0, targetCount),
        unresolvedCount: resolved.unresolved.length,
    };
}
