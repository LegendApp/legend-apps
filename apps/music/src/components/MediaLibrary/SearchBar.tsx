import type { RefObject } from "react";
import { View } from "react-native";

import { TextInputSearch, type TextInputSearchRef } from "@/components/TextInputSearch";
import { libraryUI$ } from "@/systems/LibraryState";

interface MediaLibrarySearchBarProps {
    searchInputRef: RefObject<TextInputSearchRef | null>;
    query: string;
    width: number;
}

export function MediaLibrarySearchBar({ searchInputRef, query, width }: MediaLibrarySearchBarProps) {
    return (
        <View className="-ml-1.5" style={{ width }}>
            <TextInputSearch
                ref={searchInputRef}
                value$={libraryUI$.searchQuery}
                placeholder="Search library"
                className="text-sm text-text-primary"
            />
        </View>
    );
}
