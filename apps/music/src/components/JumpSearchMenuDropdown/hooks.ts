import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { playlistNavigationState$ } from "@/state/playlistNavigationState";
import KeyboardManager, { type KeyboardEvent, KeyCodes } from "@/systems/keyboard/KeyboardManager";
import type { LibraryItem } from "@/systems/LibraryState";
import type { LocalPlaylist, LocalTrack } from "@/systems/LocalMusicState";
import { getQueueAction, type QueueAction } from "@/utils/queueActions";

export type SearchResult =
    | { type: "track"; item: LocalTrack }
    | { type: "library"; item: LibraryItem }
    | { type: "playlist"; item: LocalPlaylist };

export interface UseSearchDropdownStateResult {
    searchQuery$: Observable<string>;
    searchQuery: string;
    isOpen$: Observable<boolean>;
    isOpen: boolean;
    handleOpenChange: (open: boolean) => void;
}

export function useSearchDropdownState(onOpenChange?: (open: boolean) => void): UseSearchDropdownStateResult {
    const searchQuery$ = useObservable("");
    const searchQuery = useValue(searchQuery$);
    const isOpen$ = useObservable(false);
    const isOpen = useValue(isOpen$);

    const handleOpenChange = useCallback(
        (open: boolean) => {
            isOpen$.set(open);
            playlistNavigationState$.isSearchDropdownOpen.set(open);
            if (!open) {
                searchQuery$.set("");
            }
            onOpenChange?.(open);
        },
        [isOpen$, onOpenChange, searchQuery$],
    );

    return { searchQuery$, searchQuery, isOpen$, isOpen, handleOpenChange };
}

interface BuildSearchResultsInput {
    query: string;
    tracks: LocalTrack[];
    playlists: LocalPlaylist[];
    albums: LibraryItem[];
    artists: LibraryItem[];
}

export function buildSearchResults({
    query,
    tracks,
    playlists,
    albums,
    artists,
}: BuildSearchResultsInput): SearchResult[] {
    const trimmed = query.trim();
    if (!trimmed) {
        return [];
    }

    const MAX_RESULTS = 20;
    const lowerQuery = trimmed.toLowerCase();
    const results: SearchResult[] = [];

    for (const track of tracks) {
        if (results.length >= MAX_RESULTS) {
            break;
        }
        const title = track.title.toLowerCase();
        const artist = track.artist.toLowerCase();
        const album = track.album?.toLowerCase();
        if (title.includes(lowerQuery) || artist.includes(lowerQuery) || album?.includes(lowerQuery)) {
            results.push({ type: "track", item: track });
        }
    }

    for (const playlist of playlists) {
        if (results.length >= MAX_RESULTS) {
            break;
        }
        if (playlist.name.toLowerCase().includes(lowerQuery)) {
            results.push({ type: "playlist", item: playlist });
        }
    }

    for (const artist of artists) {
        if (results.length >= MAX_RESULTS) {
            break;
        }
        if (artist.name.toLowerCase().includes(lowerQuery)) {
            results.push({ type: "library", item: artist });
        }
    }

    for (const album of albums) {
        if (results.length >= MAX_RESULTS) {
            break;
        }
        if (album.name.toLowerCase().includes(lowerQuery)) {
            results.push({ type: "library", item: album });
        }
    }

    return results;
}

interface UsePlaylistSearchResultsOptions {
    tracks: LocalTrack[];
    playlists: LocalPlaylist[];
    albums: LibraryItem[];
    artists: LibraryItem[];
    query: string;
}

export function usePlaylistSearchResults({
    tracks,
    playlists,
    albums,
    artists,
    query,
}: UsePlaylistSearchResultsOptions) {
    return useMemo(
        () => buildSearchResults({ query, tracks, playlists, albums, artists }),
        [albums, artists, playlists, query, tracks],
    );
}

interface UseDropdownKeyboardNavigationOptions {
    isOpen: boolean;
    resultsLength: number;
    onSubmit: (index: number, action: QueueAction) => void;
    onEscape?: () => void;
}

const createDefaultModifierState = () => ({
    shift: false,
    option: false,
    alt: false,
    ctrl: false,
    meta: false,
});

export function useDropdownKeyboardNavigation({
    isOpen,
    resultsLength,
    onSubmit,
    onEscape,
}: UseDropdownKeyboardNavigationOptions) {
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const modifierStateRef = useRef(createDefaultModifierState());

    const resetModifiers = useCallback(() => {
        modifierStateRef.current = createDefaultModifierState();
    }, []);

    const updateModifierState = useCallback((event: KeyboardEvent) => {
        modifierStateRef.current = {
            shift: KeyboardManager.hasModifier(event, KeyCodes.MODIFIER_SHIFT),
            option: KeyboardManager.hasModifier(event, KeyCodes.MODIFIER_OPTION),
            alt: KeyboardManager.hasModifier(event, KeyCodes.MODIFIER_OPTION),
            ctrl: KeyboardManager.hasModifier(event, KeyCodes.MODIFIER_CONTROL),
            meta: KeyboardManager.hasModifier(event, KeyCodes.MODIFIER_COMMAND),
        };
    }, []);

    useEffect(() => {
        if (!isOpen || resultsLength === 0) {
            setHighlightedIndex(-1);
            return;
        }

        setHighlightedIndex((prev) => {
            if (prev < 0 || prev >= resultsLength) {
                return 0;
            }
            return prev;
        });
    }, [isOpen, resultsLength]);

    useEffect(() => {
        const removeKeyDown = KeyboardManager.addKeyDownListener((event) => {
            updateModifierState(event);

            if (!isOpen || resultsLength === 0) {
                return false;
            }

            if (event.keyCode === KeyCodes.KEY_ESCAPE) {
                onEscape?.();
                resetModifiers();
                return true;
            }

            if (event.keyCode === KeyCodes.KEY_DOWN) {
                setHighlightedIndex((prev) => {
                    if (prev < 0) {
                        return 0;
                    }
                    return (prev + 1) % resultsLength;
                });
                return true;
            }

            if (event.keyCode === KeyCodes.KEY_UP) {
                setHighlightedIndex((prev) => {
                    if (prev < 0) {
                        return resultsLength - 1;
                    }
                    return (prev - 1 + resultsLength) % resultsLength;
                });
                return true;
            }

            if (event.keyCode === KeyCodes.KEY_RETURN && resultsLength > 0) {
                const action = getQueueAction({
                    modifierState: modifierStateRef.current,
                });
                const index = highlightedIndex >= 0 ? highlightedIndex : 0;
                onSubmit(index, action);
                resetModifiers();
                return true;
            }

            return false;
        });

        const removeKeyUp = KeyboardManager.addKeyUpListener((event) => {
            updateModifierState(event);
            if (event.modifiers === 0) {
                resetModifiers();
            }
            return false;
        });

        return () => {
            removeKeyDown();
            removeKeyUp();
        };
    }, [highlightedIndex, isOpen, onEscape, onSubmit, resetModifiers, resultsLength, updateModifierState]);

    return {
        highlightedIndex,
        setHighlightedIndex,
        modifierStateRef,
        resetModifiers,
    };
}
