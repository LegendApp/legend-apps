import { getAICommandAvailability } from "@legend-desktop/ai";
import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Button } from "@/components/Button";
import { showToast } from "@/components/Toast";
import { generatePlaylistExtension } from "@/systems/ai/playlistGeneration";
import type { PlaylistAIContext } from "@/systems/ai/playlistContext";
import type { LocalTrack } from "@/systems/LocalMusicState";

export type AIButtonsAddResult = {
    addedCount: number;
    targetName?: string;
    undo?: () => void;
};

export type AIButtonsProps = {
    canUseAI: boolean;
    libraryTracks: LocalTrack[];
    onAddTracks: (tracks: LocalTrack[]) => Promise<AIButtonsAddResult> | AIButtonsAddResult;
    playlist: PlaylistAIContext;
};

export function AIButtons({ canUseAI, libraryTracks, onAddTracks, playlist }: AIButtonsProps) {
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [hasAITool, setHasAITool] = useState(false);
    const trimmedPrompt = prompt.trim();
    const canGenerate = canUseAI && hasAITool && !isGenerating;
    const canAutoGenerate = canGenerate && playlist.trackPaths.length > 0;
    const canPromptGenerate = canGenerate;

    useEffect(() => {
        let isMounted = true;

        getAICommandAvailability()
            .then((availability) => {
                if (isMounted) {
                    setHasAITool(Boolean(availability.preferredTool));
                }
            })
            .catch(() => {
                if (isMounted) {
                    setHasAITool(false);
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
                <Button
                    size="small"
                    variant="secondary"
                    disabled={!canAutoGenerate}
                    className={!canAutoGenerate ? "opacity-50" : undefined}
                    onClick={() => void handleGenerate()}
                >
                    {isGenerating ? "Generating..." : "Auto"}
                </Button>
                <Button
                    size="small"
                    variant="secondary"
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
