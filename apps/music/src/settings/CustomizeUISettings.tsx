import { useObserveEffect } from "@legendapp/state/react";
import { Fragment, useMemo } from "react";
import { Text, View } from "react-native";

import { Checkbox } from "@/components/Checkbox";
import { DragDropProvider, DraggableItem, DroppableZone } from "@/components/dnd";
import { usePlaybackControlLayout } from "@/hooks/useUIControls";
import { SettingsPage, SettingsRow, SettingsSection } from "@/settings/components";
import { SUPPORT_PLAYLISTS } from "@/systems/constants";
import { Icon } from "@/systems/Icon";
import { type PlaybackControlId, settings$, type UIControlLayout } from "@/systems/Settings";
import type { SFSymbols } from "@/types/SFSymbols";
import { cn } from "@legend-desktop/classnames";

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
        id: "toggleVisualizer",
        label: "Visualizer",
        // description: "Show or hide the visualizer",
        iconMarginTop: -4,
        icon: "waveform",
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

export function CustomizeUISettings() {
    const playbackLayout = usePlaybackControlLayout();

    useObserveEffect(() => {
        ensureLayoutCompleteness(settings$.ui.playback.get(), PLAYBACK_CONTROL_DEFINITIONS);
    });

    const normalizedPlaybackLayout = useNormalizedLayout(playbackLayout, PLAYBACK_CONTROL_DEFINITIONS);

    return (
        <SettingsPage>
            <DragDropProvider>
                <View className="flex flex-col gap-8">
                    <SettingsSection
                        title="Playback Controls"
                        description="Drag controls between Shown and Hidden to curate the playback toolbar."
                        first
                    >
                        <SettingsRow
                            title="Enable playback controls"
                            description="Show the playback toolbar beneath the Now Playing area."
                            control={<Checkbox $checked={settings$.ui.playbackControlsEnabled} />}
                        />
                        <ControlLayoutEditor layout={normalizedPlaybackLayout} definitions={PLAYBACK_CONTROL_MAP} />
                    </SettingsSection>
                </View>
            </DragDropProvider>
        </SettingsPage>
    );
}

function useNormalizedLayout<T extends string>(
    layout: UIControlLayout<T>,
    definitions: ControlDefinition<T>[],
): NormalizedUIControlLayout<T> {
    return useMemo(() => normalizeLayout(layout, definitions), [layout.shown, definitions]);
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
    const handleMove = (params: MoveControlParams<T>) => {
        moveControl(params);
    };

    const shownItems = layout.shown;
    const hiddenItems = layout.hidden;

    return (
        <View className="flex flex-col gap-6">
            <ControlGroup
                label="Shown"
                items={shownItems}
                group="shown"
                definitions={definitions}
                onMove={handleMove}
            />
            <ControlGroup
                label="Hidden"
                items={hiddenItems}
                group="hidden"
                definitions={definitions}
                onMove={handleMove}
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
    const zoneId = PLAYBACK_DRAG_ZONE_ID;
    const hasItems = items.length > 0;

    return (
        <View className="flex flex-col gap-3">
            <Text className="text-sm font-semibold text-text-secondary">{label}</Text>
            <View className="rounded-2xl border border-border-primary bg-white/5 py-2">
                <View className={cn("flex flex-row flex-wrap items-center", hasItems ? undefined : "justify-center")}>
                    <ControlDropZone targetGroup={group} index={0} onMove={onMove} isExpanded={!hasItems} />
                    {items.map((controlId, index) => (
                        <Fragment key={`${group}-${controlId}`}>
                            <DraggableItem<ControlDragData<T>>
                                id={`playback-${controlId}`}
                                zoneId={zoneId}
                                data={() => ({ controlId, group })}
                                className="flex-shrink-0"
                            >
                                <ControlChip definition={definitions[controlId]} />
                            </DraggableItem>
                            {index < items.length - 1 && (
                                <ControlDropZone targetGroup={group} index={index + 1} onMove={onMove} />
                            )}
                        </Fragment>
                    ))}
                    {hasItems && (
                        <ControlDropZone targetGroup={group} index={items.length} onMove={onMove} isExpanded />
                    )}
                </View>
            </View>
        </View>
    );
}

interface ControlDropZoneProps<T extends string> {
    targetGroup: ControlGroup;
    index: number;
    onMove: (params: MoveControlParams<T>) => void;
    isExpanded?: boolean;
}

function ControlDropZone<T extends string>({
    targetGroup,
    index,
    onMove,
    isExpanded = false,
}: ControlDropZoneProps<T>) {
    const dropId = `playback-${targetGroup}-drop-${index}`;
    const baseClassName = isExpanded ? "px-2 h-10 flex-1 w-full basis-full" : "h-10 w-2 flex-shrink-0";
    const indicatorClass = isExpanded
        ? "rounded-2xl border border-emerald-500/40 bg-emerald-500/10"
        : "rounded-full bg-emerald-500/40";
    const dropHitSlop = isExpanded
        ? { top: 12, bottom: 12, left: 8, right: 8 }
        : { top: 12, bottom: 12, left: 16, right: 16 };

    return (
        <DroppableZone
            id={dropId}
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
            className={baseClassName}
            activeClassName="opacity-100"
            hitSlop={dropHitSlop}
        >
            {(isActive) => (
                <View
                    className={cn(
                        "h-full w-full transition-opacity",
                        indicatorClass,
                        isActive ? "opacity-100" : "opacity-0",
                    )}
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
        <View className="flex-row items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
            <View className="rounded-lg bg-white/10 p-2 pointer-events-none">
                <Icon name={definition.icon} size={14} color="#fff" yOffset={definition.iconMarginTop} />
            </View>
            <View className="flex-col max-w-[160px]">
                <Text className="text-xs font-semibold text-text-primary" numberOfLines={1} ellipsizeMode="tail">
                    {definition.label}
                </Text>
            </View>
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
