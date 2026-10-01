import { createHotkeyRouter, useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import type { Observable } from "@legendapp/state";
import { useObservable, useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { playlistNavigationState$ } from "../../state/playlistNavigationState";
import { hasModifier, type KeyboardEvent, KeyCodes } from "../../systems/keyboard/KeyboardManager";
import type { LibraryItem } from "../../systems/LibraryState";
import type { LocalPlaylist, LocalTrack } from "../../systems/LocalMusicState";
import { getQueueAction, type QueueAction } from "../../utils/queueActions";

const dropdownHotkeyRouter = createHotkeyRouter();
const dropdownEscapeDefinitions = [{ id: "escape", title: "Close Search", defaultBindings: ["Escape"], allowExtraModifiers: true }];
const dropdownNavigationDefinitions = [
    { id: "down", title: "Next Result", defaultBindings: ["Down"], allowExtraModifiers: true, repeat: true },
    { id: "up", title: "Previous Result", defaultBindings: ["Up"], allowExtraModifiers: true, repeat: true },
    { id: "submit", title: "Open Result", defaultBindings: ["Enter"], allowExtraModifiers: true },
];

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
    const highlightedIndex$ = useObservable(-1);
    const modifierStateRef = useRef(createDefaultModifierState());

    const resetModifiers = useCallback(() => {
        modifierStateRef.current = createDefaultModifierState();
    }, []);

    const updateModifierState = useCallback((event: KeyboardEvent) => {
        modifierStateRef.current = {
            shift: hasModifier(event, KeyCodes.MODIFIER_SHIFT),
            option: hasModifier(event, KeyCodes.MODIFIER_OPTION),
            alt: hasModifier(event, KeyCodes.MODIFIER_OPTION),
            ctrl: hasModifier(event, KeyCodes.MODIFIER_CONTROL),
            meta: hasModifier(event, KeyCodes.MODIFIER_COMMAND),
        };
    }, []);

    useEffect(() => {
        if (!isOpen || resultsLength === 0) {
            highlightedIndex$.set(-1);
            return;
        }

        highlightedIndex$.set((prev) => {
            if (prev < 0 || prev >= resultsLength) {
                return 0;
            }
            return prev;
        });
    }, [highlightedIndex$, isOpen, resultsLength]);

    useRoutedHotkeys({
        router: dropdownHotkeyRouter, definitions: dropdownEscapeDefinitions,
        scope: { kind: "window", windowId: "main" }, enabled: isOpen,
        handlers: { escape: () => { onEscape?.(); resetModifiers(); } }, onError: console.error,
    });
    useRoutedHotkeys({
        router: dropdownHotkeyRouter, definitions: dropdownNavigationDefinitions,
        scope: { kind: "window", windowId: "main" }, enabled: isOpen && resultsLength > 0,
        handlers: {
            down: () => highlightedIndex$.set(prev => prev < 0 ? 0 : (prev + 1) % resultsLength),
            up: () => highlightedIndex$.set(prev => prev < 0 ? resultsLength - 1 : (prev - 1 + resultsLength) % resultsLength),
            submit: ({ event }) => {
                updateModifierState(event);
                onSubmit(Math.max(0, highlightedIndex$.peek()), getQueueAction({ modifierState: modifierStateRef.current }));
                resetModifiers();
            },
        }, onError: console.error,
    });

    return {
        highlightedIndex$,
        modifierStateRef,
        resetModifiers,
    };
}
