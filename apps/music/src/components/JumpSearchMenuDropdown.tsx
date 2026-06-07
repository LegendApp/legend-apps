import { LegendList } from "@legendapp/list/react-native";
import { useValue } from "@legendapp/state/react";
import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import { type GestureResponderEvent, Text, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/Button";
import { DropdownMenu, type DropdownMenuRootRef } from "@/components/DropdownMenu";
import { TextInputSearch, type TextInputSearchRef } from "@/components/TextInputSearch";
import { TrackItem } from "@/components/TrackItem";
import type { LibraryItem } from "@/systems/LibraryState";
import { library$ } from "@/systems/LibraryState";
import type { LocalPlaylist, LocalTrack } from "@/systems/LocalMusicState";
import type { NativeMouseEvent } from "@/types/NativeMouseEvent";
import { cn } from "@legend-desktop/classnames";
import { getQueueAction, type QueueAction } from "@/utils/queueActions";

import {
    type SearchResult,
    useDropdownKeyboardNavigation,
    usePlaylistSearchResults,
    useSearchDropdownState,
} from "./JumpSearchMenuDropdown/hooks";

interface JumpSearchMenuDropdownProps {
    tracks: LocalTrack[];
    playlists: LocalPlaylist[];
    onSelectTrack: (track: LocalTrack, action: QueueAction) => void;
    onSelectLibraryItem?: (item: LibraryItem, action: QueueAction) => void;
    onSelectPlaylist?: (playlist: LocalPlaylist) => void;
    onOpenChange?: (open: boolean) => void;
    dropdownWidth?: number;
}

export const JumpSearchMenuDropdown = forwardRef<DropdownMenuRootRef, JumpSearchMenuDropdownProps>(
    function JumpSearchMenuDropdown(
        { tracks, playlists, onSelectTrack, onSelectLibraryItem, onSelectPlaylist, onOpenChange, dropdownWidth },
        ref,
    ) {
        const { searchQuery$, searchQuery, isOpen, isOpen$, handleOpenChange } = useSearchDropdownState(onOpenChange);
        const textInputRef = useRef<TextInputSearchRef>(null);
        const { width: windowWidth } = useWindowDimensions();

        const library = useValue(library$);
        const effectiveWindowWidth = Math.max(windowWidth, 1);
        const fallbackWidth = Math.max(effectiveWindowWidth - 16, 1);
        const resolvedDropdownWidth = Math.max(dropdownWidth ?? fallbackWidth, 1);

        const searchResults = usePlaylistSearchResults({
            tracks,
            playlists,
            albums: library.albums,
            artists: library.artists,
            query: searchQuery,
        });

        const handleSearchResultAction = useCallback(
            (result: SearchResult, action: QueueAction) => {
                if (result.type === "track") {
                    onSelectTrack(result.item, action);
                } else if (result.type === "library") {
                    onSelectLibraryItem?.(result.item, action);
                } else if (result.type === "playlist") {
                    onSelectPlaylist?.(result.item);
                }
            },
            [onSelectLibraryItem, onSelectPlaylist, onSelectTrack],
        );

        const { highlightedIndex, modifierStateRef, resetModifiers } = useDropdownKeyboardNavigation({
            isOpen,
            resultsLength: searchResults.length,
            onEscape: () => handleOpenChange(false),
            onSubmit: (index, action) => {
                const result = searchResults[index];
                if (result) {
                    handleSearchResultAction(result, action);
                    resetModifiers();
                    handleOpenChange(false);
                }
            },
        });

        useEffect(() => {
            if (isOpen) {
                setTimeout(() => {
                    textInputRef.current?.focus();
                }, 0);
            }
        }, [isOpen]);

        const anchorRect = useMemo(() => {
            const offsetTop = 16;

            return {
                screenX: 8,
                screenY: offsetTop,
                width: resolvedDropdownWidth,
                height: 0,
            };
        }, [resolvedDropdownWidth]);

        const handleDropdownOpenChange = useCallback(
            (open: boolean) => {
                if (!open) {
                    resetModifiers();
                }
                handleOpenChange(open);
            },
            [handleOpenChange, resetModifiers],
        );

        const getActionFromEvent = useCallback(
            (event?: NativeMouseEvent | GestureResponderEvent): QueueAction => {
                return getQueueAction({
                    event: event as unknown as {
                        shiftKey?: boolean;
                        altKey?: boolean;
                        ctrlKey?: boolean;
                        metaKey?: boolean;
                        nativeEvent?: {
                            shiftKey?: boolean;
                            altKey?: boolean;
                            ctrlKey?: boolean;
                            metaKey?: boolean;
                        };
                    },
                    modifierState: modifierStateRef.current,
                    fallbackAction: "play-now",
                });
            },
            [modifierStateRef],
        );

        const keyExtractor = useCallback((result: SearchResult) => `${result.type}-${result.item.id}`, []);

        const getFixedItemSize = useCallback((item: SearchResult) => (item.type === "track" ? 32 : 52), []);

        const getItemType = useCallback((item: SearchResult) => item.type, []);

        const handleItemSelect = useCallback(
            (result: SearchResult, action: QueueAction) => {
                handleSearchResultAction(result, action);
                resetModifiers();
                handleOpenChange(false);
            },
            [handleOpenChange, handleSearchResultAction, resetModifiers],
        );

        const renderItem = useCallback(
            ({ item: result, index }: { item: SearchResult; index: number }) => {
                const isHighlighted = highlightedIndex === index;

                const handleDropdownSelect = (event?: NativeMouseEvent | GestureResponderEvent) => {
                    const action = getActionFromEvent(event);
                    handleItemSelect(result, action);
                };

                const handleContentSelect = (action: QueueAction) => {
                    handleItemSelect(result, action);
                };

                return (
                    <DropdownMenu.Item
                        key={`${result.type}-${result.item.id}`}
                        variant="unstyled"
                        onSelect={handleDropdownSelect}
                        className={cn(
                            "hover:bg-white/10 rounded-md w-full overflow-hidden",
                            isHighlighted && "bg-white/20",
                        )}
                    >
                        <SearchResultContent
                            result={result}
                            index={index}
                            highlighted={isHighlighted}
                            onSelect={handleContentSelect}
                            getActionFromEvent={getActionFromEvent}
                        />
                    </DropdownMenu.Item>
                );
            },
            [getActionFromEvent, handleItemSelect, highlightedIndex],
        );

        return (
            <DropdownMenu.Root ref={ref} isOpen$={isOpen$} onOpenChange={handleDropdownOpenChange}>
                <DropdownMenu.Trigger asChild>
                    <Button
                        icon="magnifyingglass"
                        variant="icon-hover"
                        size="xs"
                        iconYOffset={1}
                        iconSize={14}
                        tooltip="Search playlists"
                    />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                    directionalHint="topCenter"
                    anchorRect={anchorRect}
                    minWidth={anchorRect.width}
                    maxWidth={anchorRect.width}
                    setInitialFocus
                    variant="unstyled"
                >
                    <View style={{ width: resolvedDropdownWidth }}>
                        <View className="bg-background-tertiary border border-border-primary rounded-md px-3 py-1.5">
                            <TextInputSearch
                                ref={textInputRef}
                                value$={searchQuery$}
                                placeholder="Search tracks..."
                                className="text-sm text-text-primary"
                            />
                        </View>

                        {searchQuery.trim() ? (
                            <View>
                                {searchResults.length > 0 ? (
                                    <View style={{ maxHeight: 256 }}>
                                        <LegendList
                                            data={searchResults}
                                            keyExtractor={keyExtractor}
                                            style={{ maxHeight: 256 }}
                                            extraData={{ highlightedIndex }}
                                            getFixedItemSize={getFixedItemSize}
                                            getItemType={getItemType}
                                            renderItem={renderItem}
                                        />
                                    </View>
                                ) : (
                                    <Text className="text-white/60 text-sm p-2">No results found</Text>
                                )}
                            </View>
                        ) : null}
                    </View>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        );
    },
);

interface SearchResultContentProps {
    result: SearchResult;
    index: number;
    highlighted: boolean;
    onSelect: (action: QueueAction) => void;
    getActionFromEvent: (event?: NativeMouseEvent | GestureResponderEvent) => QueueAction;
}

function SearchResultContent({ result, index, highlighted, onSelect, getActionFromEvent }: SearchResultContentProps) {
    const handleClick = useCallback(
        (event?: NativeMouseEvent) => {
            onSelect(getActionFromEvent(event));
        },
        [getActionFromEvent, onSelect],
    );

    const handleContextMenu = useCallback(
        (_index: number, event: NativeMouseEvent) => {
            onSelect(getActionFromEvent(event));
        },
        [getActionFromEvent, onSelect],
    );

    if (result.type === "track") {
        return (
            // <View className={cn(highlighted && "bg-white/10")}>
            <TrackItem
                track={result.item}
                index={index}
                onClick={(_, event) => handleClick(event)}
                onRightClick={handleContextMenu}
                showIndex={false}
            />
        );
    }

    const label = result.item.name;
    const subtitle = getSubtitle(result);

    return (
        <View className={cn("flex-row items-center px-3 py-2", highlighted ? "bg-white/10 rounded-md" : "rounded-md")}>
            <View className="mr-3 w-8 h-8 bg-white/10 rounded flex-row items-center justify-center">
                <Text className="text-white/70 text-xs font-medium">{getGlyph(result)}</Text>
            </View>
            <View className="flex-1">
                <Text className="text-white text-sm font-medium" numberOfLines={1}>
                    {label}
                </Text>
                {subtitle ? <Text className="text-white/60 text-xs">{subtitle}</Text> : null}
            </View>
        </View>
    );
}

function getGlyph(result: SearchResult) {
    if (result.type === "library") {
        return result.item.type === "album" ? "♪" : "👤";
    }
    return "PL";
}

function getSubtitle(result: SearchResult): string {
    if (result.type === "library") {
        const count = result.item.trackCount ?? 0;
        const label = result.item.type === "album" ? "Album" : "Artist";
        return count === 1 ? `${label} • 1 track` : `${label} • ${count} tracks`;
    }

    if (result.type === "playlist") {
        const count = result.item.trackCount ?? 0;
        return count === 1 ? "1 track" : `${count} tracks`;
    }

    return "";
}
