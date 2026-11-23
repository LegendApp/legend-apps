import { getCodexAvailability } from "@legendapp/spark/ai/codex";
import { type MenuItem, showContextMenu } from "@legendapp/spark/context-menu";
import { useWindowId } from "@legendapp/spark/windows";
import { useCallback, useEffect } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";

import { Button } from "./Button";
import { useToast } from "./Toast";
import { state$ as appState$ } from "../systems/State";
import type { NativeMouseEvent } from "../types/NativeMouseEvent";
import { generatePlaylistExtension } from "../systems/ai/playlistGeneration";
import type { PlaylistAIContext } from "../systems/ai/playlistContext";
import type { LocalTrack } from "../systems/LocalMusicState";
import { batch, type Observable } from "@legendapp/state";
import { Show, useObservable, useValue } from "@legendapp/state/react";
import { spotifyStatus$ } from "../providers/spotify/provider";
import { appleMusicStatus$ } from "../providers/appleMusic/provider";
import {
    AI_SOURCE_IDS,
    AI_SOURCE_LABELS,
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

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export function AIButtons(props: AIButtonsProps) {
    const toolbarEnabled = useValue(settings$.ai.toolbarEnabled);
    return toolbarEnabled ? <AIButtonsContent {...props} /> : null;
}

function AIButtonsContent({ canUseAI, disabledReason, libraryTracks, onAddTracks, playlist }: AIButtonsProps) {
    const showToast = useToast();
    const windowId = useWindowId();
    const state$ = useObservable({
        isPromptOpen: false,
        prompt: "",
        isGenerating: false,
        aiToolState: { status: "checking" } as AIToolState,
    });
    const isGenerating = useValue(state$.isGenerating);
    const aiToolState = useValue(state$.aiToolState);
    const defaultSources = useValue(settings$.ai.defaultSources);
    const overrideSources = useValue(settings$.ai.playlistSourceOverrides[playlist.id]);
    const spotifyStatus = useValue(spotifyStatus$);
    const appleMusicStatus = useValue(appleMusicStatus$);
    const hasSourceOverride = Array.isArray(overrideSources) && overrideSources.length > 0;
    const sources: AITrackSources = normalizeAISources(
        hasSourceOverride ? overrideSources : defaultSources,
        AI_SOURCE_IDS,
    );
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

    useEffect(() => {
        let isMounted = true;

        getCodexAvailability()
            .then((availability) => {
                if (isMounted) {
                    state$.aiToolState.set(availability.available
                        ? { status: "available" }
                        : {
                            message: availability.message,
                            status: "unavailable",
                        });
                }
            })
            .catch((error: unknown) => {
                if (isMounted) {
                    state$.aiToolState.set({
                        message: `Could not start Codex: ${errorMessage(error)}`,
                        status: "unavailable",
                    });
                }
            });

        return () => {
            isMounted = false;
        };
    }, [state$]);

    const handleGenerate = useCallback(
        async (userPrompt?: string) => {
            if (unavailableMessage !== null || state$.isGenerating.peek()) {
                return;
            }

            state$.isGenerating.set(true);
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
                showToast(message, "error");
            }
            state$.isGenerating.set(false);
        },
        [unavailableMessage, libraryTracks, onAddTracks, playlist, showToast, sources, state$],
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

    const handleSubmitPrompt = useCallback(() => {
        const trimmedPrompt = state$.prompt.peek().trim();
        if (!trimmedPrompt) {
            showToast("Enter a prompt first", "error");
            return;
        }
        if (!canGenerate) {
            const message = unavailableMessage ?? "AI playlist generation is unavailable.";
            showToast(message, "error");
            return;
        }

        batch(() => {
            state$.isPromptOpen.set(false);
            state$.prompt.set("");
        });
        void handleGenerate(trimmedPrompt);
    }, [canGenerate, handleGenerate, showToast, unavailableMessage, state$]);

    const handleAutoGenerate = useCallback(() => {
        if (playlist.trackPaths.length === 0) {
            const message = "Add at least one seed track for Auto, or use Prompt.";
            showToast(message, "error");
            return;
        }

        void handleGenerate();
    }, [handleGenerate, playlist.trackPaths.length, showToast, state$]);

    const handleOpenMenu = useCallback(async (event: NativeMouseEvent) => {
        const items: MenuItem[] = [
            { type: "action", id: "auto", label: "Add Similar Songs", disabled: playlist.trackPaths.length === 0 },
            { type: "action", id: "prompt", label: "Add Songs from Prompt…" },
            { type: "separator" },
            ...AI_SOURCE_IDS.map((source): MenuItem => ({
                type: "checkbox",
                id: `source:${source}`,
                label: `Search ${AI_SOURCE_LABELS[source]}`,
                checked: sources.includes(source),
            })),
            { type: "action", id: "defaults", label: "Use Default Sources", hidden: !hasSourceOverride },
            { type: "separator" },
            { type: "action", id: "settings", label: "AI Settings…" },
        ];
        const selection = await showContextMenu({
            items,
            windowId,
            position: { x: event.pageX ?? event.x ?? 0, y: event.pageY ?? event.y ?? 0 },
        });
        if (selection.canceled) return;
        const { itemId } = selection;
        if (itemId === "settings") {
            appState$.assign({ showSettings: true, showSettingsPage: "general" });
        } else if (itemId === "defaults") {
            settings$.ai.playlistSourceOverrides[playlist.id].delete();
        } else if (itemId.startsWith("source:")) {
            const source = itemId.slice("source:".length) as MusicProviderId;
            handleSourceToggle(source, !sources.includes(source));
        } else if (unavailableMessage !== null) {
            showToast(unavailableMessage, "error");
        } else if (itemId === "auto") {
            handleAutoGenerate();
        } else {
            state$.isPromptOpen.set(true);
        }
    }, [handleAutoGenerate, handleSourceToggle, hasSourceOverride, playlist, showToast, sources, state$, unavailableMessage, windowId]);

    return (
        <>
            <Show
                if={state$.isPromptOpen}
                else={
                    <View className="absolute bottom-2 right-3 z-10">
                        {isGenerating ? (
                            <View className="size-7 items-center justify-center">
                                <ActivityIndicator size="small" accessibilityLabel="Generating playlist suggestions" />
                            </View>
                        ) : (
                            <Button
                                size="small"
                                variant="icon-bg"
                                icon="sparkles"
                                iconSize={13}
                                accessibilityLabel="AI playlist"
                                accessibilityRole="button"
                                tooltip="AI playlist"
                                onClick={handleOpenMenu}
                            />
                        )}
                    </View>
                }
            >
                <View className="px-3 py-2 flex-row items-center gap-2 border-t border-border-primary">
                    <PromptInput prompt$={state$.prompt} onSubmit={handleSubmitPrompt} />
                    <Button
                        size="small"
                        variant="icon"
                        icon="xmark"
                        iconSize={12}
                        accessibilityLabel="Cancel prompt"
                        accessibilityRole="button"
                        onClick={() => {
                            state$.isPromptOpen.set(false);
                            state$.prompt.set("");
                        }}
                    />
                    <PromptSubmit prompt$={state$.prompt} canGenerate={canGenerate} onSubmit={handleSubmitPrompt} />
                </View>
            </Show>
        </>
    );
}

function PromptInput({ prompt$, onSubmit }: { prompt$: Observable<string>; onSubmit: () => void }) {
    const prompt = useValue(prompt$);
    return <TextInput
        autoFocus value={prompt} onChangeText={(value) => prompt$.set(value)} onSubmitEditing={onSubmit}
        placeholder="Describe songs to add…"
        accessibilityLabel="AI prompt"
        className="h-7 min-w-0 flex-1 rounded-md border border-border-primary bg-black/20 px-2 text-sm text-text-primary"
    />;
}

function PromptSubmit({ prompt$, canGenerate, onSubmit }: { prompt$: Observable<string>; canGenerate: boolean; onSubmit: () => void }) {
    const enabled = useValue(() => canGenerate && prompt$.get().trim().length > 0);
    return <Button size="small" variant="primary" accessibilityLabel="Generate playlist" accessibilityRole="button"
        disabled={!enabled} className={!enabled ? "opacity-50" : undefined} onClick={onSubmit}>
        Generate
    </Button>;
}
