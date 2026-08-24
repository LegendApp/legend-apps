import { getCodexAvailability } from "@legend-apps/codex";
import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Button } from "./Button";
import { showToast } from "./Toast";
import { generatePlaylistExtension } from "../systems/ai/playlistGeneration";
import type { PlaylistAIContext } from "../systems/ai/playlistContext";
import type { LocalTrack } from "../systems/LocalMusicState";

export type AIButtonsAddResult = {
    addedCount: number;
    targetName?: string;
    undo?: () => void;
};

export type AIButtonsProps = {
    canUseAI: boolean;
    disabledReason?: string;
    libraryTracks: LocalTrack[];
    onAddTracks: (tracks: LocalTrack[]) => Promise<AIButtonsAddResult> | AIButtonsAddResult;
    playlist: PlaylistAIContext;
};

type AIToolState =
    | { status: "checking" }
    | { status: "available" }
    | { message: string; status: "unavailable" };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export function AIButtons({ canUseAI, disabledReason, libraryTracks, onAddTracks, playlist }: AIButtonsProps) {
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [aiToolState, setAIToolState] = useState<AIToolState>({ status: "checking" });
    const trimmedPrompt = prompt.trim();
    let unavailableMessage: string | null = null;
    if (!canUseAI) {
        unavailableMessage = disabledReason ?? "AI cannot edit this playlist in its current state.";
    } else if (aiToolState.status === "checking") {
        unavailableMessage = "Checking Codex…";
    } else if (aiToolState.status === "unavailable") {
        unavailableMessage = aiToolState.message;
    } else if (libraryTracks.length === 0) {
        unavailableMessage = "No library songs are available. Add or re-authorize a folder in Settings, then rescan.";
    }

    const canGenerate = unavailableMessage === null && !isGenerating;
    const canAutoGenerate = canGenerate && playlist.trackPaths.length > 0;
    const canPromptGenerate = canGenerate;

    const autoDisabledReason = unavailableMessage ?? (
        playlist.trackPaths.length === 0 ? "Add at least one seed track for Auto, or use Prompt." : undefined
    );
    const statusMessage = isGenerating
        ? "Generating playlist suggestions…"
        : generationError ?? unavailableMessage ?? (
            playlist.trackPaths.length === 0 ? "Add a seed track for Auto, or describe what you want with Prompt." : null
        );

    useEffect(() => {
        let isMounted = true;

        getCodexAvailability()
            .then((availability) => {
                if (isMounted) {
                    setAIToolState(availability.available
                        ? { status: "available" }
                        : {
                            message: availability.message,
                            status: "unavailable",
                        });
                }
            })
            .catch((error: unknown) => {
                if (isMounted) {
                    setAIToolState({
                        message: `Could not start Codex: ${errorMessage(error)}`,
                        status: "unavailable",
                    });
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleGenerate = useCallback(
        async (userPrompt?: string) => {
            if (!canGenerate) {
                return;
            }

            setIsGenerating(true);
            setGenerationError(null);
            try {
                const result = await generatePlaylistExtension({
                    libraryTracks,
                    playlist,
                    userPrompt,
                });
                const addResult = await onAddTracks(result.tracks);

                if (addResult.addedCount === 0) {
                    showToast("No new tracks to add", "info");
                } else {
                    let targetName = playlist.name;
                    if (addResult.targetName) {
                        targetName = addResult.targetName;
                    }

                    let unresolvedSuffix = "";
                    if (result.unresolvedCount > 0) {
                        unresolvedSuffix = ` (${result.unresolvedCount} unresolved)`;
                    }

                    let undo: { label: string; onPress: () => void } | undefined;
                    if (addResult.undo) {
                        undo = { label: "Undo", onPress: addResult.undo };
                    }

                    let trackNoun = "tracks";
                    if (addResult.addedCount === 1) {
                        trackNoun = "track";
                    }

                    showToast(
                        `Added ${addResult.addedCount} ${trackNoun} to ${targetName}${unresolvedSuffix}`,
                        "info",
                        undo,
                    );
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "Failed to generate playlist tracks";
                setGenerationError(message);
                showToast(message, "error");
            }
            setIsGenerating(false);
        },
        [canGenerate, libraryTracks, onAddTracks, playlist],
    );

    const handleSubmitPrompt = useCallback(() => {
        if (!trimmedPrompt) {
            showToast("Enter a prompt first", "error");
            return;
        }

        setIsPromptOpen(false);
        setPrompt("");
        void handleGenerate(trimmedPrompt);
    }, [handleGenerate, trimmedPrompt]);

    return (
        <>
            <View className="px-3 py-2 flex-row items-center justify-end gap-2 border-t border-border-primary">
                {statusMessage ? (
                    <Text className="min-w-0 flex-1 text-xs leading-tight text-text-secondary" numberOfLines={2}>
                        {statusMessage}
                    </Text>
                ) : (
                    <View className="flex-1" />
                )}
                <Button
                    size="small"
                    variant="secondary"
                    accessibilityLabel="Auto"
                    accessibilityRole="button"
                    accessibilityHint={autoDisabledReason}
                    disabled={!canAutoGenerate}
                    className={!canAutoGenerate ? "opacity-50" : undefined}
                    onClick={() => void handleGenerate()}
                >
                    {isGenerating ? "Generating..." : "Auto"}
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    accessibilityLabel="Prompt"
                    accessibilityRole="button"
                    accessibilityHint={unavailableMessage ?? undefined}
                    disabled={!canPromptGenerate}
                    className={!canPromptGenerate ? "opacity-50" : undefined}
                    onClick={() => setIsPromptOpen(true)}
                >
                    Prompt
                </Button>
            </View>
            {isPromptOpen ? (
                <View className="absolute inset-0 z-20 items-center justify-center bg-black/50">
                    <View className="w-[440px] rounded-lg border border-border-primary bg-background-secondary p-4 gap-3 shadow-lg">
                        <View className="gap-1">
                            <Text className="text-base font-semibold text-text-primary">Prompt</Text>
                            <Text className="text-xs text-text-secondary" numberOfLines={2}>
                                {playlist.name}
                            </Text>
                        </View>
                        <TextInput
                            multiline
                            value={prompt}
                            onChangeText={setPrompt}
                            placeholder="More upbeat, less acoustic, similar era..."
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            className="min-h-28 rounded-md border border-border-primary bg-black/20 px-3 py-2 text-sm text-text-primary"
                            textAlignVertical="top"
                        />
                        <View className="flex-row justify-end gap-2">
                            <Button
                                size="small"
                                variant="secondary"
                                accessibilityLabel="Cancel prompt"
                                accessibilityRole="button"
                                onClick={() => {
                                    setIsPromptOpen(false);
                                    setPrompt("");
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="small"
                                variant="accent"
                                accessibilityLabel="Generate playlist"
                                accessibilityRole="button"
                                disabled={!trimmedPrompt}
                                className={!trimmedPrompt ? "opacity-50" : undefined}
                                onClick={handleSubmitPrompt}
                            >
                                Generate
                            </Button>
                        </View>
                    </View>
                </View>
            ) : null}
        </>
    );
}
