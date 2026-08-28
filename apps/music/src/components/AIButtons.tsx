import { getCodexAvailability } from "@legend-apps/codex";
import { useCallback, useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { useToast } from "./Toast";
import { generatePlaylistExtension } from "../systems/ai/playlistGeneration";
import type { PlaylistAIContext } from "../systems/ai/playlistContext";
import type { LocalTrack } from "../systems/LocalMusicState";
import { useValue } from "@legendapp/state/react";
import { spotifyStatus$ } from "../providers/spotify/provider";
import { appleMusicStatus$ } from "../providers/appleMusic/provider";
import {
    AI_SOURCE_IDS,
    normalizeAISources,
    settings$,
    type AITrackSources,
    type MusicProviderId,
} from "../systems/Settings";

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

const SOURCE_LABELS: Record<MusicProviderId, string> = {
    local: "Local Music",
    spotify: "Spotify",
    appleMusic: "Apple Music",
};

function sourceSummary(sources: readonly MusicProviderId[]): string {
    return sources.map((source) => SOURCE_LABELS[source].replace(" Music", "")).join(" + ");
}

function SourceChoices({
    appleMusicConnected,
    disabled = false,
    libraryCount,
    onToggle,
    sources,
    spotifyConnected,
}: {
    appleMusicConnected: boolean;
    disabled?: boolean;
    libraryCount: number;
    onToggle: (source: MusicProviderId, checked: boolean) => void;
    sources: readonly MusicProviderId[];
    spotifyConnected: boolean;
}) {
    const details: Record<MusicProviderId, string> = {
        local: `${libraryCount.toLocaleString()} ${libraryCount === 1 ? "song" : "songs"}`,
        spotify: spotifyConnected ? "Connected" : "Set up in Settings → Spotify",
        appleMusic: appleMusicConnected ? "Connected" : "Set up in Settings → Apple Music",
    };

    return (
        <View className="gap-2">
            {AI_SOURCE_IDS.map((source) => (
                <View key={source} className="rounded-md bg-white/5 px-2 py-1.5">
                    <Checkbox
                        checked={sources.includes(source)}
                        disabled={disabled}
                        label={SOURCE_LABELS[source]}
                        onChange={(checked) => onToggle(source, checked)}
                    />
                    <Text className="ml-7 text-xs text-text-tertiary">{details[source]}</Text>
                </View>
            ))}
        </View>
    );
}

function SourcePolicyChoices({
    hasSourceOverride,
    onUseDefaults,
    onUseOverride,
}: {
    hasSourceOverride: boolean;
    onUseDefaults: () => void;
    onUseOverride: () => void;
}) {
    return (
        <View className="flex-row gap-2">
            <Button
                size="small"
                variant={hasSourceOverride ? "secondary" : "accent"}
                accessibilityState={{ selected: !hasSourceOverride }}
                onClick={onUseDefaults}
            >
                Use AI defaults
            </Button>
            <Button
                size="small"
                variant={hasSourceOverride ? "accent" : "secondary"}
                accessibilityState={{ selected: hasSourceOverride }}
                onClick={onUseOverride}
            >
                Override this playlist
            </Button>
        </View>
    );
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export function AIButtons(props: AIButtonsProps) {
    const toolbarEnabled = useValue(settings$.ai.toolbarEnabled) ?? true;
    return toolbarEnabled ? <AIButtonsContent {...props} /> : null;
}

function AIButtonsContent({ canUseAI, disabledReason, libraryTracks, onAddTracks, playlist }: AIButtonsProps) {
    const showToast = useToast();
    const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [aiToolState, setAIToolState] = useState<AIToolState>({ status: "checking" });
    const defaultSources = useValue(settings$.ai.defaultSources);
    const overrideSources = useValue(settings$.ai.playlistSourceOverrides[playlist.id]);
    const spotifyStatus = useValue(spotifyStatus$);
    const appleMusicStatus = useValue(appleMusicStatus$);
    const hasSourceOverride = Array.isArray(overrideSources) && overrideSources.length > 0;
    const sources: AITrackSources = normalizeAISources(
        hasSourceOverride ? overrideSources : defaultSources,
        AI_SOURCE_IDS,
    );
    const trimmedPrompt = prompt.trim();
    let unavailableMessage: string | null = null;
    if (!canUseAI) {
        unavailableMessage = disabledReason ?? "AI cannot edit this playlist in its current state.";
    } else if (aiToolState.status === "checking") {
        unavailableMessage = "Checking Codex…";
    } else if (aiToolState.status === "unavailable") {
        unavailableMessage = aiToolState.message;
    } else if (sources.length === 1 && sources[0] === "local" && libraryTracks.length === 0) {
        unavailableMessage = "No local songs are available. Add or re-authorize a folder in Settings → Library, then rescan.";
    } else if (sources.length === 1 && sources[0] === "spotify" && (!spotifyStatus.enabled || !spotifyStatus.authenticated)) {
        unavailableMessage = "Connect Spotify in Settings → Spotify, then try again.";
    } else if (sources.length === 1 && sources[0] === "appleMusic" && (!appleMusicStatus.enabled || !appleMusicStatus.authenticated)) {
        unavailableMessage = "Connect Apple Music in Settings → Apple Music, then try again.";
    } else if (
        (!sources.includes("local") || libraryTracks.length === 0)
        && (!sources.includes("spotify") || !spotifyStatus.enabled || !spotifyStatus.authenticated)
        && (!sources.includes("appleMusic") || !appleMusicStatus.enabled || !appleMusicStatus.authenticated)
    ) {
        unavailableMessage = "None of the selected music sources are available. Add a local library, connect a selected service, or choose other sources.";
    }

    const canGenerate = unavailableMessage === null && !isGenerating;
    const canAutoGenerate = canGenerate;
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
                    sources,
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
        [canGenerate, libraryTracks, onAddTracks, playlist, showToast, sources],
    );

    const handleSourceToggle = useCallback((source: MusicProviderId, checked: boolean) => {
        const nextSources = checked
            ? AI_SOURCE_IDS.filter((candidate) => candidate === source || sources.includes(candidate))
            : sources.filter((candidate) => candidate !== source);
        if (nextSources.length === 0) {
            showToast("Choose at least one AI music source.", "error");
            return;
        }
        settings$.ai.playlistSourceOverrides[playlist.id].set(nextSources);
    }, [playlist.id, showToast, sources]);

    const handleUseDefaults = useCallback(() => {
        settings$.ai.playlistSourceOverrides[playlist.id].delete();
    }, [playlist.id]);

    const handleUseOverride = useCallback(() => {
        settings$.ai.playlistSourceOverrides[playlist.id].set([...sources]);
    }, [playlist.id, sources]);

    const handleSubmitPrompt = useCallback(() => {
        if (!trimmedPrompt) {
            showToast("Enter a prompt first", "error");
            return;
        }
        if (!canGenerate) {
            const message = unavailableMessage ?? "AI playlist generation is unavailable.";
            setGenerationError(message);
            showToast(message, "error");
            return;
        }

        setIsPromptOpen(false);
        setPrompt("");
        void handleGenerate(trimmedPrompt);
    }, [canGenerate, handleGenerate, showToast, trimmedPrompt, unavailableMessage]);

    const handleAutoGenerate = useCallback(() => {
        if (playlist.trackPaths.length === 0) {
            const message = "Add at least one seed track for Auto, or use Prompt.";
            setGenerationError(message);
            showToast(message, "error");
            return;
        }

        void handleGenerate();
    }, [handleGenerate, playlist.trackPaths.length, showToast]);

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
                    icon="slider.horizontal.3"
                    iconSize={12}
                    size="small"
                    variant="secondary"
                    accessibilityLabel={`AI sources: ${sourceSummary(sources)}`}
                    accessibilityRole="button"
                    tooltip="Choose AI music sources"
                    onClick={() => setIsSourcePickerOpen(true)}
                >
                    <Text className="text-xs font-medium text-text-secondary" numberOfLines={1}>
                        {hasSourceOverride
                            ? `This playlist · ${sourceSummary(sources)}`
                            : `Default · ${sourceSummary(sources)}`}
                    </Text>
                </Button>
                <Button
                    size="small"
                    variant="icon-bg"
                    icon="wand.and.stars"
                    accessibilityLabel="Auto generate"
                    accessibilityRole="button"
                    accessibilityHint={autoDisabledReason}
                    tooltip={autoDisabledReason ?? "Auto generate from this playlist"}
                    disabled={!canAutoGenerate}
                    className={!canAutoGenerate ? "opacity-50" : undefined}
                    onClick={handleAutoGenerate}
                />
                <Button
                    size="small"
                    variant="icon-bg"
                    icon="text.bubble"
                    accessibilityLabel="Prompt AI"
                    accessibilityRole="button"
                    accessibilityHint={unavailableMessage ?? undefined}
                    tooltip={unavailableMessage ?? "Prompt AI to add songs"}
                    disabled={!canPromptGenerate}
                    className={!canPromptGenerate ? "opacity-50" : undefined}
                    onClick={() => setIsPromptOpen(true)}
                />
            </View>
            {isSourcePickerOpen ? (
                <View className="absolute inset-0 z-20 items-center justify-center bg-black/50">
                    <View className="w-[380px] rounded-lg border border-border-primary bg-background-secondary p-4 gap-3 shadow-lg">
                        <View className="gap-1">
                            <Text className="text-base font-semibold text-text-primary">AI music sources</Text>
                            <Text className="text-xs leading-relaxed text-text-secondary">
                                Choose whether {playlist.name} follows your AI defaults or has its own sources.
                            </Text>
                        </View>
                        <SourcePolicyChoices
                            hasSourceOverride={hasSourceOverride}
                            onUseDefaults={handleUseDefaults}
                            onUseOverride={handleUseOverride}
                        />
                        <SourceChoices
                            appleMusicConnected={appleMusicStatus.enabled && appleMusicStatus.authenticated}
                            disabled={!hasSourceOverride}
                            libraryCount={libraryTracks.length}
                            onToggle={handleSourceToggle}
                            sources={sources}
                            spotifyConnected={spotifyStatus.enabled && spotifyStatus.authenticated}
                        />
                        <View className="flex-row items-center justify-between gap-3">
                            <View className="min-w-0 flex-1">
                                <Text className="text-xs text-text-tertiary">
                                    {hasSourceOverride
                                        ? "These sources apply to both Auto and Prompt for this playlist."
                                        : "Change the defaults in Settings → General → AI playlists."}
                                </Text>
                            </View>
                            <Button size="small" variant="accent" onClick={() => setIsSourcePickerOpen(false)}>
                                Done
                            </Button>
                        </View>
                    </View>
                </View>
            ) : null}
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
                        <View className="gap-2">
                            <Text className="text-xs font-medium text-text-secondary">Find tracks in</Text>
                            <SourcePolicyChoices
                                hasSourceOverride={hasSourceOverride}
                                onUseDefaults={handleUseDefaults}
                                onUseOverride={handleUseOverride}
                            />
                            <SourceChoices
                                appleMusicConnected={appleMusicStatus.enabled && appleMusicStatus.authenticated}
                                disabled={!hasSourceOverride}
                                libraryCount={libraryTracks.length}
                                onToggle={handleSourceToggle}
                                sources={sources}
                                spotifyConnected={spotifyStatus.enabled && spotifyStatus.authenticated}
                            />
                            <View className="flex-row items-center justify-between gap-2">
                                <Text className="min-w-0 flex-1 text-xs text-text-tertiary">
                                    {hasSourceOverride
                                        ? "This choice also applies to Auto. A matching local copy is always preferred."
                                        : "Using your AI defaults. A matching local copy is always preferred."}
                                </Text>
                            </View>
                            {unavailableMessage ? (
                                <Text className="text-xs leading-relaxed text-red-300">{unavailableMessage}</Text>
                            ) : null}
                        </View>
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
                                disabled={!trimmedPrompt || !canGenerate}
                                className={!trimmedPrompt || !canGenerate ? "opacity-50" : undefined}
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
