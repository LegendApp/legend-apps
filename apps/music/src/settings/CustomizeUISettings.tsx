import { useObserveEffect, useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import { PlatformColor, Text, View } from "react-native";

import { DragDropProvider, DraggableItem, DroppableZone } from "../components/dnd";
import { usePlaybackControlLayout } from "../hooks/useUIControls";
import { SettingsCaption, SettingsSection, SettingsSwitchRow } from "./components";
import { SUPPORT_PLAYLISTS } from "../systems/constants";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { type PlaybackControlId, settings$, type UIControlLayout } from "../systems/Settings";
import type { SFSymbols } from "../types/SFSymbols";

type ControlGroup = "shown" | "hidden";
type ControlDragData<T extends string> = {
    controlId: T;
    group: ControlGroup;
};

interface ControlDefinition<T extends string> {
    id: T;
    label: string;
    // description: string;
    icon: SFSymbols;
    iconMarginTop?: number;
}

interface NormalizedUIControlLayout<T extends string> {
    shown: T[];
    hidden: T[];
}

const PLAYBACK_CONTROL_DEFINITIONS: ControlDefinition<PlaybackControlId>[] = [
    {
        id: "previous",
        label: "Previous",
        // description: "Skip to the previous track",
        icon: "backward.end.fill",
    },
    {
        id: "playPause",
        label: "Play / Pause",
        // description: "Toggle playback",
        icon: "play.fill",
    },
    {
        id: "next",
        label: "Next",
        // description: "Advance to the next track",
        icon: "forward.end.fill",
    },
    {
        id: "shuffle",
        label: "Shuffle",
        // description: "Toggle shuffle mode",
        icon: "shuffle",
    },
    {
        id: "repeat",
        label: "Repeat",
        // description: "Cycle repeat modes",
        icon: "repeat",
    },
    {
        id: "search",
        label: "Search",
        // description: "Open the search dialog",
        iconMarginTop: -2,
        icon: "magnifyingglass",
    },
    SUPPORT_PLAYLISTS && {
        id: "savePlaylist",
        label: "Save Playlist",
        // description: "Export the current queue",
        icon: "square.and.arrow.down",
    },
    {
        id: "toggleLibrary",
        label: "Library",
        // description: "Open or close the media library",
        iconMarginTop: -2,
        icon: "sidebar.right",
    },
    {
        id: "spacer",
        label: "Spacer",
        icon: "arrow.left.and.right",
    },
];

const PLAYBACK_CONTROL_MAP = Object.fromEntries(
    PLAYBACK_CONTROL_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<PlaybackControlId, ControlDefinition<PlaybackControlId>>;

const PLAYBACK_DRAG_ZONE_ID = "customize-playback-controls";

export function CustomizeUISettingsContent() {
    const playbackControlsEnabled = useValue(settings$.ui.playbackControlsEnabled);
    const playbackLayout = usePlaybackControlLayout();

    useObserveEffect(() => {
        ensureLayoutCompleteness(settings$.ui.playback.get(), PLAYBACK_CONTROL_DEFINITIONS);
    });

    const normalizedPlaybackLayout = useNormalizedLayout(playbackLayout, PLAYBACK_CONTROL_DEFINITIONS);

    return (
        <DragDropProvider>
            <SettingsSection title="Playback Controls">
                <SettingsCaption>Drag controls between Shown and Hidden to curate the playback toolbar.</SettingsCaption>
                <SettingsSwitchRow
                    label="Enable playback controls"
                    description="Show the playback toolbar beneath the Now Playing area."
                    value={playbackControlsEnabled}
                    onValueChange={(value) => settings$.ui.playbackControlsEnabled.set(value)}
                />
                <ControlLayoutEditor layout={normalizedPlaybackLayout} definitions={PLAYBACK_CONTROL_MAP} />
            </SettingsSection>
        </DragDropProvider>
    );
}

function useNormalizedLayout<T extends string>(
    layout: UIControlLayout<T>,
    definitions: ControlDefinition<T>[],
): NormalizedUIControlLayout<T> {
    return useMemo(() => normalizeLayout(layout, definitions), [definitions, layout]);
}

function normalizeLayout<T extends string>(
    layout: UIControlLayout<T> | undefined,
    definitions: ControlDefinition<T>[],
): NormalizedUIControlLayout<T> {
    const allIds = definitions.map((definition) => definition.id);
    const allowed = new Set(allIds);
    const seen = new Set<T>();
    const shown: T[] = [];

    for (const id of layout?.shown ?? []) {
        if (allowed.has(id) && !seen.has(id)) {
            shown.push(id);
            seen.add(id);
        }
    }

    const hidden = allIds.filter((id) => !seen.has(id));

    return { shown, hidden };
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    return a.every((value, index) => value === b[index]);
}

function ensureLayoutCompleteness<T extends string>(layout: UIControlLayout<T>, definitions: ControlDefinition<T>[]) {
    const normalized = normalizeLayout(layout, definitions);
    const sanitizedLayout: UIControlLayout<T> = {
        shown: normalized.shown,
    };

    if (arraysEqual(layout?.shown ?? [], sanitizedLayout.shown)) {
        return;
    }

    settings$.ui.playback.set(sanitizedLayout as UIControlLayout<PlaybackControlId>);
}

interface ControlLayoutEditorProps<T extends string> {
    layout: NormalizedUIControlLayout<T>;
    definitions: Record<T, ControlDefinition<T>>;
}

function ControlLayoutEditor<T extends string>({ layout, definitions }: ControlLayoutEditorProps<T>) {
    return (
        <View className="gap-4 px-2.5 pb-2.5 pt-3">
            <ControlGroup
                label="Shown"
                items={layout.shown}
                group="shown"
                definitions={definitions}
                onMove={moveControl}
            />
            <ControlGroup
                label="Hidden"
                items={layout.hidden}
                group="hidden"
                definitions={definitions}
                onMove={moveControl}
            />
        </View>
    );
}

interface ControlGroupProps<T extends string> {
    label: string;
    items: T[];
    group: ControlGroup;
    definitions: Record<T, ControlDefinition<T>>;
    onMove: (params: MoveControlParams<T>) => void;
}

function ControlGroup<T extends string>({ label, items, group, definitions, onMove }: ControlGroupProps<T>) {
    return (
        <View className="gap-2">
            <Text className="text-sm font-medium text-text-secondary">{label}</Text>
            <View className="rounded-lg border border-border-primary bg-background-secondary p-2">
                <View className="flex-row flex-wrap items-center gap-2">
                    {items.map((controlId, index) => (
                        <View key={controlId}>
                            <DraggableItem<ControlDragData<T>>
                                id={`playback-${controlId}`}
                                zoneId={PLAYBACK_DRAG_ZONE_ID}
                                data={() => ({ controlId, group })}
                                className="shrink-0"
                            >
                                <ControlChip definition={definitions[controlId]} />
                            </DraggableItem>
                            <ControlDropZone
                                targetGroup={group}
                                index={index}
                                onMove={onMove}
                                className="absolute -left-1 top-0 h-8 w-1"
                            />
                        </View>
                    ))}
                    <ControlDropZone
                        targetGroup={group}
                        index={items.length}
                        onMove={onMove}
                        className={items.length > 0 ? "-ml-2 h-8 flex-1" : "h-8 w-full"}
                    />
                </View>
            </View>
        </View>
    );
}

interface ControlDropZoneProps<T extends string> {
    targetGroup: ControlGroup;
    index: number;
    onMove: (params: MoveControlParams<T>) => void;
    className: string;
}

const dropHitSlop = { top: 4, bottom: 4, left: 5, right: 5 };

function ControlDropZone<T extends string>({
    targetGroup,
    index,
    onMove,
    className,
}: ControlDropZoneProps<T>) {
    return (
        <DroppableZone
            id={`playback-${targetGroup}-drop-${index}`}
            allowDrop={() => true}
            onDrop={(item) => {
                const payload = item.data as ControlDragData<T>;
                onMove({
                    controlId: payload.controlId,
                    sourceGroup: payload.group,
                    targetGroup,
                    targetIndex: index,
                });
            }}
            className={className}
            hitSlop={dropHitSlop}
        >
            {(isActive) => (
                <View
                    className={`absolute inset-0 rounded bg-accent-primary/40 ${isActive ? "opacity-100" : "opacity-0"}`}
                />
            )}
        </DroppableZone>
    );
}

interface ControlChipProps<T extends string> {
    definition: ControlDefinition<T>;
}

function ControlChip<T extends string>({ definition }: ControlChipProps<T>) {
    return (
        <View className="h-8 flex-row items-center gap-1.5 rounded-md border border-border-primary bg-background-tertiary px-2">
            <SFSymbol name={definition.icon} size={16} color={PlatformColor("labelColor")} yOffset={definition.iconMarginTop} />
            <Text className="text-text-primary" style={{ fontSize: 13, lineHeight: 16 }}>
                {definition.label}
            </Text>
        </View>
    );
}

interface MoveControlParams<T extends string> {
    controlId: T;
    sourceGroup: ControlGroup;
    targetGroup: ControlGroup;
    targetIndex: number;
}

function moveControl<T extends string>({ controlId, sourceGroup, targetGroup, targetIndex }: MoveControlParams<T>) {
    const layout = (settings$.ui.playback.get() as UIControlLayout<T>) ?? { shown: [] };
    const definitions = PLAYBACK_CONTROL_DEFINITIONS as ControlDefinition<T>[];

    const normalized = normalizeLayout(layout, definitions);
    const filteredShown = normalized.shown.filter((id) => id !== controlId);

    let nextShown = filteredShown;

    if (targetGroup === "shown") {
        const originalIndex = normalized.shown.indexOf(controlId);
        let insertIndex = targetIndex;

        if (sourceGroup === "shown" && originalIndex !== -1 && originalIndex < targetIndex) {
            insertIndex = Math.max(0, targetIndex - 1);
        }

        const boundedIndex = Math.max(0, Math.min(insertIndex, filteredShown.length));
        nextShown = [...filteredShown];
        nextShown.splice(boundedIndex, 0, controlId);
    }

    const sanitized = normalizeLayout({ shown: nextShown }, definitions);

    if (arraysEqual(normalized.shown, sanitized.shown)) {
        return;
    }

    const nextLayout: UIControlLayout<T> = {
        shown: sanitized.shown,
    };

    settings$.ui.playback.set(nextLayout as UIControlLayout<PlaybackControlId>);
}
