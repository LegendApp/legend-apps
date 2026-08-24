import type { RefObject } from "react";
import { View } from "react-native";

import { TextInputSearch, type TextInputSearchRef } from "../TextInputSearch";
import { libraryUI$ } from "../../systems/LibraryState";

interface MediaLibrarySearchBarProps {
    searchInputRef: RefObject<TextInputSearchRef | null>;
}

export function MediaLibrarySearchBar({ searchInputRef }: MediaLibrarySearchBarProps) {
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
