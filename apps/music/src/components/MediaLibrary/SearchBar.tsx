import type { RefObject } from "react";
import { View } from "react-native";

import { TextInputSearch, type TextInputSearchRef } from "../TextInputSearch";
import { useOnHotkeys } from "../../systems/keyboard/Keyboard";
import { libraryUI$ } from "../../systems/LibraryState";

interface MediaLibrarySearchBarProps {
    searchInputRef: RefObject<TextInputSearchRef | null>;
}

export function MediaLibrarySearchBar({ searchInputRef }: MediaLibrarySearchBarProps) {
    useOnHotkeys({ Search: () => {
        searchInputRef.current?.focus();
        return true;
    } }, { priority: 100 });
    return (
        <View className="px-2 pb-2">
            <TextInputSearch
                ref={searchInputRef}
                value$={libraryUI$.searchQuery}
                placeholder="Search library"
                className="text-sm text-text-primary"
            />
        </View>
    );
}
